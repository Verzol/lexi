from datetime import datetime

from pydantic import BaseModel

from app.models.enums import CardSource


class CardOut(BaseModel):
    id: int
    deck_id: int
    term: str
    meaning: str
    ipa: str | None = None
    example_sentence: str | None = None
    image_url: str | None = None
    audio_url: str | None = None
    source: CardSource

    model_config = {"from_attributes": True}


class DeckOut(BaseModel):
    id: int
    name: str
    description: str | None = None
    exam_tag: str | None = None
    topic_tags: list[str]

    model_config = {"from_attributes": True}


class AssignedDeckOut(DeckOut):
    """A deck as a student sees it — with their own due count folded in."""

    due_count: int
    card_count: int


class DeckCreate(BaseModel):
    name: str
    description: str | None = None
    exam_tag: str | None = None
    topic_tags: list[str] = []


class CardCreate(BaseModel):
    term: str
    meaning: str
    ipa: str | None = None
    example_sentence: str | None = None
    source: CardSource = CardSource.manual


class AssignmentCreate(BaseModel):
    student_id: int
    deck_id: int
    daily_new_target: int | None = None


class AssignmentOut(BaseModel):
    id: int
    student_id: int
    deck_id: int
    daily_new_target: int | None
    assigned_at: datetime
    active: bool

    model_config = {"from_attributes": True}
