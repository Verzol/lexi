import logging

import jwt
from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.deps import current_admin, current_user
from app.auth.google import (
    GoogleAuthError,
    GoogleNotConfigured,
    verify_google_credential,
)
from app.auth.security import (
    create_email_verify_token,
    create_token,
    decode_email_verify_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.config import get_settings
from app.db import get_db
from app.email import send_verification_email
from app.models import Streak, User, UserRole
from app.ratelimit import rate_limit
from app.schemas.auth import (
    CreateStudentRequest,
    GoogleLoginRequest,
    LoginRequest,
    RegisterRequest,
    TokenResponse,
    UserOut,
    VerifyEmailRequest,
)

logger = logging.getLogger("app.auth")
settings = get_settings()
router = APIRouter(prefix="/auth", tags=["auth"])

# Per-IP throttles: login is the brute-force surface, register the signup-abuse one.
_login_throttle = rate_limit("login", settings.login_rate_limit, settings.login_rate_window_s)
_register_throttle = rate_limit(
    "register", settings.register_rate_limit, settings.register_rate_window_s
)
_resend_throttle = rate_limit("resend", 5, 3600)


def _issue_session(response: Response, user: User) -> TokenResponse:
    """Set the rotating refresh cookie and return the access-token payload."""
    _set_refresh_cookie(response, user)
    return TokenResponse(
        access_token=create_token(user.id, user.role.value, "access", user.token_version),
        user=UserOut.model_validate(user),
    )


def _send_verification(user: User) -> None:
    """Best-effort: never let a mail hiccup fail the surrounding request."""
    token = create_email_verify_token(user.id)
    verify_url = f"{settings.app_base_url}/verify-email?token={token}"
    try:
        send_verification_email(user.email, user.display_name, verify_url)
    except Exception:  # noqa: BLE001 — mail is non-critical to the request
        logger.exception("Failed to send verification email to %s", user.email)


def _set_refresh_cookie(response: Response, user: User) -> None:
    response.set_cookie(
        key=settings.refresh_cookie_name,
        value=create_token(user.id, user.role.value, "refresh", user.token_version),
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        max_age=settings.refresh_token_days * 24 * 60 * 60,
        path="/auth",
    )


@router.post("/login", response_model=TokenResponse, dependencies=[Depends(_login_throttle)])
def login(body: LoginRequest, response: Response, db: Session = Depends(get_db)) -> TokenResponse:
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    # Same error whether the email is unknown, the password is wrong, or the
    # account is Google-only (no password to check).
    if user is None or user.password_hash is None or not verify_password(
        body.password, user.password_hash
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password"
        )

    return _issue_session(response, user)


@router.post(
    "/register",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(_register_throttle)],
)
def register(
    body: RegisterRequest, response: Response, db: Session = Depends(get_db)
) -> TokenResponse:
    """Public self-signup: create a student account and log them straight in.

    Always creates role=student — the teacher account is provisioned separately.
    NOTE (flagged, not yet built): this endpoint has no email verification and no
    rate limiting. Both should land before any real public launch — see
    docs/SoW §5. Deliberately minimal for the first self-serve pass.
    """
    email = body.email.lower()
    if db.scalar(select(User).where(User.email == email)) is not None:
        # Distinct from login's uniform error: at signup, telling the user the
        # email is taken is the expected, non-sensitive UX.
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="That email already has an account"
        )

    user = User(
        email=email,
        password_hash=hash_password(body.password),
        display_name=body.display_name.strip(),
        role=UserRole.student,
        timezone=body.timezone,
    )
    db.add(user)
    db.flush()
    db.add(Streak(student_id=user.id))
    db.commit()
    db.refresh(user)

    # Send the confirmation link. They're logged in either way (soft gate); the
    # frontend nudges them to verify. Never blocks signup on a mail failure.
    _send_verification(user)
    return _issue_session(response, user)


@router.post("/refresh", response_model=TokenResponse)
def refresh(
    response: Response,
    lexi_refresh: str | None = Cookie(default=None),
    db: Session = Depends(get_db),
) -> TokenResponse:
    if lexi_refresh is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No refresh token")
    try:
        payload = decode_token(lexi_refresh, "refresh")
    except jwt.PyJWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token"
        ) from exc

    user = db.get(User, int(payload["sub"]))
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unknown user")
    # A revoked refresh token (logout / password change) must not mint new ones.
    if payload.get("tv") != user.token_version:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token"
        )

    # Rotate the refresh token on every use.
    return _issue_session(response, user)


@router.post("/google", response_model=TokenResponse, dependencies=[Depends(_login_throttle)])
def google_login(
    body: GoogleLoginRequest, response: Response, db: Session = Depends(get_db)
) -> TokenResponse:
    """Sign in (or sign up) with a Google ID token. Always yields a student."""
    try:
        identity = verify_google_credential(body.credential)
    except GoogleNotConfigured as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google sign-in isn't available.",
        ) from exc
    except GoogleAuthError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Google sign-in failed."
        ) from exc

    # Require a Google-verified email: otherwise a spoofable address could be used
    # to take over an existing local account by email match.
    if not identity.email_verified:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Your Google email address must be verified.",
        )

    email = identity.email.lower()
    user = db.scalar(select(User).where(User.email == email))
    if user is None:
        user = User(
            email=email,
            password_hash=None,
            display_name=(identity.name or email.split("@")[0]).strip()[:120],
            role=UserRole.student,
            auth_provider="google",
            google_sub=identity.sub,
            email_verified=True,
        )
        db.add(user)
        db.flush()
        db.add(Streak(student_id=user.id))
        db.commit()
        db.refresh(user)
    else:
        # Link Google to an existing account (same verified email) on first use.
        changed = False
        if user.google_sub is None:
            user.google_sub = identity.sub
            changed = True
        if not user.email_verified:
            user.email_verified = True
            changed = True
        if changed:
            db.commit()
            db.refresh(user)

    return _issue_session(response, user)


@router.post("/verify-email", response_model=UserOut)
def verify_email(body: VerifyEmailRequest, db: Session = Depends(get_db)) -> User:
    """Confirm an email from the signup link. Idempotent — a second click is fine."""
    try:
        payload = decode_email_verify_token(body.token)
    except jwt.PyJWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This verification link is invalid or has expired.",
        ) from exc

    user = db.get(User, int(payload["sub"]))
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This verification link is invalid or has expired.",
        )
    if not user.email_verified:
        user.email_verified = True
        db.commit()
        db.refresh(user)
    return user


@router.post(
    "/resend-verification",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(_resend_throttle)],
)
def resend_verification(user: User = Depends(current_user)) -> None:
    """Re-send the confirmation email for the signed-in user, if still needed."""
    if user.email_verified or user.auth_provider != "local":
        return
    _send_verification(user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    response: Response,
    lexi_refresh: str | None = Cookie(default=None),
    db: Session = Depends(get_db),
) -> None:
    """Log out and revoke every outstanding token for this user by bumping the
    token version — so a captured access or refresh token can't outlive logout.
    Best-effort: an absent or unreadable cookie still clears the browser cookie."""
    if lexi_refresh is not None:
        try:
            payload = decode_token(lexi_refresh, "refresh")
            user = db.get(User, int(payload["sub"]))
            if user is not None:
                user.token_version += 1
                db.commit()
        except jwt.PyJWTError:
            pass
    response.delete_cookie(key=settings.refresh_cookie_name, path="/auth")


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(current_user)) -> User:
    return user


@router.post("/students", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_student(
    body: CreateStudentRequest,
    db: Session = Depends(get_db),
    _admin: User = Depends(current_admin),
) -> User:
    """There is no self-signup — only the teacher creates student accounts."""
    email = body.email.lower()
    if db.scalar(select(User).where(User.email == email)) is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="That email already has an account"
        )

    student = User(
        email=email,
        password_hash=hash_password(body.password),
        display_name=body.display_name,
        role=UserRole.student,
        timezone=body.timezone,
        daily_new_target=body.daily_new_target,
    )
    db.add(student)
    db.flush()
    db.add(Streak(student_id=student.id))
    db.commit()
    db.refresh(student)
    return student


@router.get("/students", response_model=list[UserOut])
def list_students(
    db: Session = Depends(get_db), _admin: User = Depends(current_admin)
) -> list[User]:
    return list(db.scalars(select(User).where(User.role == UserRole.student).order_by(User.id)))
