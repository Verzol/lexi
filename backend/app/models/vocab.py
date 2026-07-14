from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.enums import CardSource, pg_enum


class Language(Base):
    """Future-proofing only — Phase 1 seeds and ships English."""

    __tablename__ = "languages"

    code: Mapped[str] = mapped_column(String(8), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(64), nullable=False)


class Deck(Base):
    __tablename__ = "decks"

    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    language_id: Mapped[int] = mapped_column(ForeignKey("languages.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    # e.g. "grade-10-entrance", "university-entrance"
    exam_tag: Mapped[str | None] = mapped_column(String(64), index=True)
    topic_tags: Mapped[list[str]] = mapped_column(ARRAY(String(64)), nullable=False, default=list)

    cards = relationship("Card", back_populates="deck", cascade="all, delete-orphan")
    assignments = relationship("Assignment", back_populates="deck", cascade="all, delete-orphan")


class Card(Base):
    __tablename__ = "cards"

    deck_id: Mapped[int] = mapped_column(ForeignKey("decks.id"), nullable=False, index=True)
    term: Mapped[str] = mapped_column(String(160), nullable=False)
    meaning: Mapped[str] = mapped_column(Text, nullable=False)
    ipa: Mapped[str | None] = mapped_column(String(160))
    example_sentence: Mapped[str | None] = mapped_column(Text)
    image_url: Mapped[str | None] = mapped_column(Text)
    audio_url: Mapped[str | None] = mapped_column(Text)
    source: Mapped[CardSource] = mapped_column(
        pg_enum(CardSource, "card_source"), nullable=False, default=CardSource.manual
    )

    deck = relationship("Deck", back_populates="cards")


class Assignment(Base):
    """What the teacher has pushed to a given student."""

    __tablename__ = "assignments"

    student_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    deck_id: Mapped[int] = mapped_column(ForeignKey("decks.id"), nullable=False, index=True)
    # Overrides the student's own daily_new_target when set.
    daily_new_target: Mapped[int | None] = mapped_column(Integer)
    assigned_at: Mapped[object] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    student = relationship("User", back_populates="assignments")
    deck = relationship("Deck", back_populates="assignments")
