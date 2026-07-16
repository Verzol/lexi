from datetime import datetime

from pydantic import BaseModel


class DashboardStudent(BaseModel):
    """One row of the teacher's class table (SoW §4 admin dashboard)."""

    id: int
    display_name: str
    email: str
    current_streak: int
    # Most recent graded review, all-time. None for a student who's never studied.
    last_active_at: datetime | None
    # Whole days since last activity (or since signup if never active) — drives
    # the relative "last active" label and the slipping flag.
    days_inactive: int | None
    due_count: int
    reviewed_week: int
    # All-time recall accuracy as an integer percent; None with no reviews yet.
    accuracy: int | None
    slipping: bool


class DashboardSummary(BaseModel):
    total_students: int
    active_this_week: int
    reviewed_week: int
    avg_accuracy: int | None
    slipping_count: int


class DeckProgress(BaseModel):
    """Per (class) deck progress — how far the assigned students have gotten."""

    id: int
    name: str
    exam_tag: str | None
    card_count: int
    students_assigned: int
    # Share of assigned (student × card) scheduling states that have graduated to
    # the `review` state — i.e. "learned". None when no card has been seen yet.
    mastered_pct: int | None


class DashboardOut(BaseModel):
    students: list[DashboardStudent]
    summary: DashboardSummary
    decks: list[DeckProgress]
