from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.deps import current_admin
from app.db import get_db
from app.models import Assignment, Card, Deck, Language, User, UserRole
from app.schemas.vocab import (
    AssignmentCreate,
    AssignmentOut,
    CardCreate,
    CardOut,
    DeckCreate,
    DeckOut,
)

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(current_admin)])


@router.get("/decks", response_model=list[DeckOut])
def list_decks(db: Session = Depends(get_db)) -> list[Deck]:
    return list(db.scalars(select(Deck).order_by(Deck.id)))


@router.post("/decks", response_model=DeckOut, status_code=status.HTTP_201_CREATED)
def create_deck(
    body: DeckCreate, db: Session = Depends(get_db), admin: User = Depends(current_admin)
) -> Deck:
    english = db.scalar(select(Language).where(Language.code == "en"))
    if english is None:
        raise HTTPException(status_code=500, detail="Language 'en' is not seeded")

    deck = Deck(
        owner_id=admin.id,
        language_id=english.id,
        name=body.name,
        description=body.description,
        exam_tag=body.exam_tag,
        topic_tags=body.topic_tags,
    )
    db.add(deck)
    db.commit()
    db.refresh(deck)
    return deck


@router.get("/decks/{deck_id}/cards", response_model=list[CardOut])
def list_cards(deck_id: int, db: Session = Depends(get_db)) -> list[Card]:
    return list(db.scalars(select(Card).where(Card.deck_id == deck_id).order_by(Card.id)))


@router.post(
    "/decks/{deck_id}/cards", response_model=CardOut, status_code=status.HTTP_201_CREATED
)
def create_card(deck_id: int, body: CardCreate, db: Session = Depends(get_db)) -> Card:
    if db.get(Deck, deck_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deck not found")

    card = Card(
        deck_id=deck_id,
        term=body.term,
        meaning=body.meaning,
        ipa=body.ipa,
        example_sentence=body.example_sentence,
        source=body.source,
    )
    db.add(card)
    db.commit()
    db.refresh(card)
    return card


@router.post("/assignments", response_model=AssignmentOut, status_code=status.HTTP_201_CREATED)
def assign_deck(body: AssignmentCreate, db: Session = Depends(get_db)) -> Assignment:
    student = db.get(User, body.student_id)
    if student is None or student.role is not UserRole.student:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found")
    if db.get(Deck, body.deck_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deck not found")

    existing = db.scalar(
        select(Assignment).where(
            Assignment.student_id == body.student_id, Assignment.deck_id == body.deck_id
        )
    )
    if existing is not None:
        # Re-assigning an inactive deck just reactivates it.
        existing.active = True
        existing.daily_new_target = body.daily_new_target
        db.commit()
        db.refresh(existing)
        return existing

    assignment = Assignment(
        student_id=body.student_id,
        deck_id=body.deck_id,
        daily_new_target=body.daily_new_target,
    )
    db.add(assignment)
    db.commit()
    db.refresh(assignment)
    return assignment
