from sqlalchemy import Boolean, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.enums import UserRole, pg_enum


class User(Base):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    # Nullable: a Google-only account has no password. Password login guards on this.
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    display_name: Mapped[str] = mapped_column(String(120), nullable=False)
    role: Mapped[UserRole] = mapped_column(
        pg_enum(UserRole, "user_role"), nullable=False, default=UserRole.student
    )
    # Email confirmed via the signup verification link, or asserted by Google.
    email_verified: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    # How the account signs in. "local" = email + password; "google" = Google SSO.
    auth_provider: Mapped[str] = mapped_column(
        String(16), nullable=False, default="local", server_default="local"
    )
    # Google's stable subject id, set once an account is linked to Google.
    google_sub: Mapped[str | None] = mapped_column(String(64), unique=True, index=True)
    # Drives reminder timing and the streak day boundary.
    timezone: Mapped[str] = mapped_column(String(64), nullable=False, default="Asia/Ho_Chi_Minh")
    daily_new_target: Mapped[int] = mapped_column(Integer, nullable=False, default=10)
    # Bumped to revoke every outstanding token for this user (logout, password
    # change). Each token carries the version it was minted at; a mismatch is a
    # 401. See app/auth/security.py and app/auth/deps.py.
    token_version: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )

    assignments = relationship("Assignment", back_populates="student", cascade="all, delete-orphan")
    streak = relationship(
        "Streak", back_populates="student", uselist=False, cascade="all, delete-orphan"
    )
