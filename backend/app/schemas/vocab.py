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


class CardUpdate(BaseModel):
    """Partial edit of a card. Any field left unset is untouched; setting
    `deck_id` moves the card to another deck."""

    term: str | None = None
    meaning: str | None = None
    ipa: str | None = None
    example_sentence: str | None = None
    deck_id: int | None = None


class EnrichRequest(BaseModel):
    term: str


class EnrichmentOut(BaseModel):
    """An AI-drafted card the teacher reviews before saving — nothing persisted."""

    term: str
    meaning: str
    ipa: str
    example_sentence: str


class BulkEnrichRequest(BaseModel):
    terms: list[str]


class BulkEnrichItem(BaseModel):
    """One row of a paste-a-list enrichment: a draft, or an error for that term."""

    term: str
    meaning: str | None = None
    ipa: str | None = None
    example_sentence: str | None = None
    error: str | None = None


class AssignmentCreate(BaseModel):
    student_id: int
    deck_id: int
    daily_new_target: int | None = None


class ClassAssignmentCreate(BaseModel):
    """Assign a deck to every student at once (SoW §4 whole-class control)."""

    deck_id: int
    daily_new_target: int | None = None


class StudentUpdate(BaseModel):
    """Teacher edits to a student — notably the per-student daily new-card target."""

    display_name: str | None = None
    timezone: str | None = None
    daily_new_target: int | None = None


class AssignmentOut(BaseModel):
    id: int
    student_id: int
    deck_id: int
    daily_new_target: int | None
    assigned_at: datetime
    active: bool

    model_config = {"from_attributes": True}
