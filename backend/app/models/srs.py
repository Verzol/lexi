from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.enums import CardStateEnum, Rating, ReviewSource, pg_enum


class CardState(Base):
    """
    The SRS memory, keyed per STUDENT per card — this is what lets one
    teacher-authored deck schedule independently for each student.
    """

    __tablename__ = "card_states"
    __table_args__ = (UniqueConstraint("student_id", "card_id", name="uq_card_state_student_card"),)

    student_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    card_id: Mapped[int] = mapped_column(ForeignKey("cards.id"), nullable=False, index=True)

    state: Mapped[CardStateEnum] = mapped_column(
        pg_enum(CardStateEnum, "card_state_enum"), nullable=False, default=CardStateEnum.new
    )
    # FSRS scheduler fields.
    stability: Mapped[float | None] = mapped_column(Float)
    difficulty: Mapped[float | None] = mapped_column(Float)
    step: Mapped[int | None] = mapped_column(Integer)
    due_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), index=True
    )
    last_reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    reps: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    lapses: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class Review(Base):
    """Immutable log of every grade — append only. Powers the dashboard."""

    __tablename__ = "reviews"

    student_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    card_id: Mapped[int] = mapped_column(ForeignKey("cards.id"), nullable=False, index=True)
    rating: Mapped[Rating] = mapped_column(pg_enum(Rating, "rating"), nullable=False)
    reviewed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), index=True
    )
    elapsed_ms: Mapped[int | None] = mapped_column(Integer)
    source: Mapped[ReviewSource] = mapped_column(
        pg_enum(ReviewSource, "review_source"), nullable=False, default=ReviewSource.review
    )
