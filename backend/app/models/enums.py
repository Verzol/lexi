from enum import StrEnum

from sqlalchemy import Enum as SAEnum


class UserRole(StrEnum):
    admin = "admin"
    student = "student"


class CardSource(StrEnum):
    manual = "manual"
    ai_enriched = "ai-enriched"


class CardStateEnum(StrEnum):
    new = "new"
    learning = "learning"
    review = "review"
    lapsed = "lapsed"


class Rating(StrEnum):
    again = "again"
    hard = "hard"
    good = "good"
    easy = "easy"


class ReviewSource(StrEnum):
    review = "review"
    quiz = "quiz"


def pg_enum(enum_cls: type[StrEnum], name: str) -> SAEnum:
    """
    Persist the enum's VALUE, not its Python member name. Without this,
    CardSource.ai_enriched would land in the database as "ai_enriched" rather
    than the documented "ai-enriched".
    """
    return SAEnum(
        enum_cls,
        name=name,
        values_callable=lambda cls: [member.value for member in cls],
    )
