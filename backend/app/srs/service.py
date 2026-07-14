from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Assignment, Card, CardState


def assigned_deck_ids(db: Session, student_id: int) -> list[int]:
    return list(
        db.scalars(
            select(Assignment.deck_id).where(
                Assignment.student_id == student_id, Assignment.active.is_(True)
            )
        )
    )


def ensure_card_states(db: Session, student_id: int) -> int:
    """
    Lazily materialize a CardState row for every card in the student's active
    decks. New cards a teacher adds to an already-assigned deck get picked up
    here on the student's next request. Returns the number of rows created.
    """
    deck_ids = assigned_deck_ids(db, student_id)
    if not deck_ids:
        return 0

    existing = select(CardState.card_id).where(CardState.student_id == student_id)
    missing = db.scalars(
        select(Card.id).where(Card.deck_id.in_(deck_ids), Card.id.not_in(existing))
    ).all()
    if not missing:
        return 0

    now = datetime.now(UTC)
    db.add_all(
        [CardState(student_id=student_id, card_id=card_id, due_at=now) for card_id in missing]
    )
    db.commit()
    return len(missing)


def due_count_by_deck(db: Session, student_id: int) -> dict[int, int]:
    """Cards currently due (due_at <= now), grouped by deck."""
    rows = db.execute(
        select(Card.deck_id, func.count(CardState.id))
        .join(Card, Card.id == CardState.card_id)
        .where(CardState.student_id == student_id, CardState.due_at <= datetime.now(UTC))
        .group_by(Card.deck_id)
    ).all()
    return {deck_id: count for deck_id, count in rows}


def card_count_by_deck(db: Session, deck_ids: list[int]) -> dict[int, int]:
    if not deck_ids:
        return {}
    rows = db.execute(
        select(Card.deck_id, func.count(Card.id))
        .where(Card.deck_id.in_(deck_ids))
        .group_by(Card.deck_id)
    ).all()
    return {deck_id: count for deck_id, count in rows}
