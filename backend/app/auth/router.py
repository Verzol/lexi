import jwt
from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.deps import current_admin, current_user
from app.auth.security import create_token, decode_token, hash_password, verify_password
from app.config import get_settings
from app.db import get_db
from app.models import Streak, User, UserRole
from app.schemas.auth import CreateStudentRequest, LoginRequest, TokenResponse, UserOut

settings = get_settings()
router = APIRouter(prefix="/auth", tags=["auth"])


def _set_refresh_cookie(response: Response, user: User) -> None:
    response.set_cookie(
        key=settings.refresh_cookie_name,
        value=create_token(user.id, user.role.value, "refresh"),
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        max_age=settings.refresh_token_days * 24 * 60 * 60,
        path="/auth",
    )


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, response: Response, db: Session = Depends(get_db)) -> TokenResponse:
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    # Same error whether the email is unknown or the password is wrong.
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password"
        )

    _set_refresh_cookie(response, user)
    return TokenResponse(
        access_token=create_token(user.id, user.role.value, "access"),
        user=UserOut.model_validate(user),
    )


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

    # Rotate the refresh token on every use.
    _set_refresh_cookie(response, user)
    return TokenResponse(
        access_token=create_token(user.id, user.role.value, "access"),
        user=UserOut.model_validate(user),
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response) -> None:
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
