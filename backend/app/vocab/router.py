from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.deps import current_user
from app.db import get_db
from app.models import Card, Deck, User
from app.schemas.vocab import AssignedDeckOut, CardOut
from app.srs.service import (
    assigned_deck_ids,
    card_count_by_deck,
    due_count_by_deck,
    ensure_card_states,
)

router = APIRouter(prefix="/decks", tags=["decks"])


@router.get("", response_model=list[AssignedDeckOut])
def list_my_decks(
    db: Session = Depends(get_db), user: User = Depends(current_user)
) -> list[AssignedDeckOut]:
    """Students see only the decks assigned to them — the teacher controls focus."""
    ensure_card_states(db, user.id)

    deck_ids = assigned_deck_ids(db, user.id)
    if not deck_ids:
        return []

    decks = db.scalars(select(Deck).where(Deck.id.in_(deck_ids)).order_by(Deck.id)).all()
    due = due_count_by_deck(db, user.id)
    totals = card_count_by_deck(db, deck_ids)

    return [
        AssignedDeckOut(
            id=d.id,
            name=d.name,
            description=d.description,
            exam_tag=d.exam_tag,
            topic_tags=d.topic_tags,
            due_count=due.get(d.id, 0),
            card_count=totals.get(d.id, 0),
        )
        for d in decks
    ]


@router.get("/{deck_id}/cards", response_model=list[CardOut])
def list_deck_cards(
    deck_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)
) -> list[Card]:
    # A student may only read cards from a deck actually assigned to them.
    if deck_id not in assigned_deck_ids(db, user.id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deck not found")

    return list(db.scalars(select(Card).where(Card.deck_id == deck_id).order_by(Card.id)))
