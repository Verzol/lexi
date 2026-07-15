from datetime import datetime

from pydantic import BaseModel

from app.models.enums import CardStateEnum, Rating


class ReviewCardOut(BaseModel):
    """A due card as the student reviews it — everything the Flashcard renders."""

    card_id: int
    deck_id: int
    term: str
    meaning: str
    ipa: str | None = None
    example_sentence: str | None = None
    image_url: str | None = None
    audio_url: str | None = None
    # The deck's exam tag drives the badge on the card.
    exam_tag: str | None = None
    state: CardStateEnum
    due_at: datetime


class GradeIn(BaseModel):
    card_id: int
    rating: Rating
    # How long the student spent on the card, for analytics — optional.
    elapsed_ms: int | None = None


class GradeOut(BaseModel):
    """The scheduler's verdict: when this card comes back and in what state."""

    card_id: int
    state: CardStateEnum
    due_at: datetime
    reps: int
