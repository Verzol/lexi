from sqlalchemy import Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.enums import UserRole, pg_enum


class User(Base):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    display_name: Mapped[str] = mapped_column(String(120), nullable=False)
    role: Mapped[UserRole] = mapped_column(
        pg_enum(UserRole, "user_role"), nullable=False, default=UserRole.student
    )
    # Drives reminder timing and the streak day boundary.
    timezone: Mapped[str] = mapped_column(String(64), nullable=False, default="Asia/Ho_Chi_Minh")
    daily_new_target: Mapped[int] = mapped_column(Integer, nullable=False, default=10)

    assignments = relationship("Assignment", back_populates="student", cascade="all, delete-orphan")
    streak = relationship(
        "Streak", back_populates="student", uselist=False, cascade="all, delete-orphan"
    )
