from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class Streak(Base):
    __tablename__ = "streaks"

    student_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), nullable=False, unique=True, index=True
    )
    current_streak: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    longest_streak: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # Stored as a plain date in the student's own timezone.
    last_completed_date: Mapped[date | None] = mapped_column(Date)
    freezes_remaining: Mapped[int] = mapped_column(Integer, nullable=False, default=2)
    # The last local day we sent this student a reminder — guards the daily job
    # against sending twice (e.g. after a restart within the reminder hour).
    last_reminded_date: Mapped[date | None] = mapped_column(Date)

    student = relationship("User", back_populates="streak")


class QuizSession(Base):
    __tablename__ = "quiz_sessions"

    student_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    score: Mapped[int | None] = mapped_column(Integer)
    question_count: Mapped[int | None] = mapped_column(Integer)
