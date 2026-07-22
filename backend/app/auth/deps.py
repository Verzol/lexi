import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.auth.security import decode_token
from app.db import get_db
from app.models import User, UserRole

bearer = HTTPBearer(auto_error=False)

_UNAUTHORIZED = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Not authenticated",
    headers={"WWW-Authenticate": "Bearer"},
)


def current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    if creds is None:
        raise _UNAUTHORIZED
    try:
        payload = decode_token(creds.credentials, "access")
    except jwt.PyJWTError as exc:
        raise _UNAUTHORIZED from exc

    user = db.get(User, int(payload["sub"]))
    if user is None:
        raise _UNAUTHORIZED
    # Reject tokens minted before the user's version was bumped (revoked).
    if payload.get("tv") != user.token_version:
        raise _UNAUTHORIZED
    return user


def current_admin(user: User = Depends(current_user)) -> User:
    """
    Authorization is enforced HERE, never in the frontend. The Next.js app only
    hides admin UI; this is the actual boundary.
    """
    if user.role is not UserRole.admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admins only")
    return user
