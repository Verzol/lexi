from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth.deps import current_user
from app.db import get_db
from app.models import Assignment, Card, CardState, Deck, Language, Review, User
from app.models.enums import CardSource
from app.schemas.vocab import (
    AssignedDeckOut,
    CardCreate,
    CardOut,
    PersonalDeckCreate,
    PersonalDeckUpdate,
    StudentCardUpdate,
)
from app.srs.service import (
    assigned_deck_ids,
    card_count_by_deck,
    due_count_by_deck,
    ensure_card_states,
)

router = APIRouter(prefix="/decks", tags=["decks"])


def _english_or_500(db: Session) -> Language:
    english = db.scalar(select(Language).where(Language.code == "en"))
    if english is None:
        raise HTTPException(status_code=500, detail="Language 'en' is not seeded")
    return english


def _owned_deck_or_404(db: Session, user: User, deck_id: int) -> Deck:
    """A deck the student authored themselves, or 404. Mirrors the rest of the API:
    a deck you don't own is indistinguishable from one that doesn't exist, so the
    endpoint can't be used to probe for other people's decks."""
    deck = db.get(Deck, deck_id)
    if deck is None or deck.owner_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deck not found")
    return deck


def _owned_card_or_404(db: Session, deck: Deck, card_id: int) -> Card:
    card = db.get(Card, card_id)
    if card is None or card.deck_id != deck.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Card not found")
    return card


@router.get("", response_model=list[AssignedDeckOut])
def list_my_decks(
    db: Session = Depends(get_db), user: User = Depends(current_user)
) -> list[AssignedDeckOut]:
    """Every deck in the student's study loop: teacher-assigned ("class") decks and
    the personal decks they authored themselves. `owned` distinguishes the two."""
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
            owned=d.owner_id == user.id,
        )
        for d in decks
    ]


@router.post("", response_model=AssignedDeckOut, status_code=status.HTTP_201_CREATED)
def create_my_deck(
    body: PersonalDeckCreate, db: Session = Depends(get_db), user: User = Depends(current_user)
) -> AssignedDeckOut:
    """Create a personal deck and drop it straight into the student's own study
    loop by self-assigning it — the same Assignment mechanism the teacher uses, so
    the SRS engine needs no special case for personal decks."""
    english = _english_or_500(db)
    deck = Deck(owner_id=user.id, language_id=english.id, name=body.name.strip(),
                description=body.description)
    db.add(deck)
    db.flush()
    db.add(Assignment(student_id=user.id, deck_id=deck.id, active=True))
    db.commit()
    db.refresh(deck)
    return AssignedDeckOut(
        id=deck.id,
        name=deck.name,
        description=deck.description,
        exam_tag=deck.exam_tag,
        topic_tags=deck.topic_tags,
        due_count=0,
        card_count=0,
        owned=True,
    )


@router.patch("/{deck_id}", response_model=AssignedDeckOut)
def rename_my_deck(
    deck_id: int,
    body: PersonalDeckUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
) -> AssignedDeckOut:
    deck = _owned_deck_or_404(db, user, deck_id)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(deck, field, value)
    db.commit()
    db.refresh(deck)
    totals = card_count_by_deck(db, [deck.id])
    return AssignedDeckOut(
        id=deck.id,
        name=deck.name,
        description=deck.description,
        exam_tag=deck.exam_tag,
        topic_tags=deck.topic_tags,
        due_count=due_count_by_deck(db, user.id).get(deck.id, 0),
        card_count=totals.get(deck.id, 0),
        owned=True,
    )


@router.delete("/{deck_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_my_deck(
    deck_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)
) -> None:
    """Delete a personal deck and its cards. Blocked once any card has been
    graded — `reviews` is an append-only log we never destroy."""
    deck = _owned_deck_or_404(db, user, deck_id)
    card_ids = list(db.scalars(select(Card.id).where(Card.deck_id == deck.id)))
    if card_ids:
        graded = db.scalar(
            select(func.count()).select_from(Review).where(Review.card_id.in_(card_ids))
        )
        if graded:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This deck has review history and can't be deleted.",
            )
        # card_states aren't in the ORM cascade — clear them before the cards go.
        db.execute(CardState.__table__.delete().where(CardState.card_id.in_(card_ids)))
    db.delete(deck)  # cascades cards + assignments via the relationship
    db.commit()


@router.get("/{deck_id}/cards", response_model=list[CardOut])
def list_deck_cards(
    deck_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)
) -> list[Card]:
    # A student may only read cards from a deck in their study loop (assigned to
    # them) — which includes their own personal decks.
    if deck_id not in assigned_deck_ids(db, user.id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deck not found")

    return list(db.scalars(select(Card).where(Card.deck_id == deck_id).order_by(Card.id)))


@router.post("/{deck_id}/cards", response_model=CardOut, status_code=status.HTTP_201_CREATED)
def add_card_to_my_deck(
    deck_id: int,
    body: CardCreate,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
) -> Card:
    """Add a card to a deck the student owns. `source` is forced to `manual` — the
    AI enrichment path stays teacher-only (cost/abuse), so a student can't route
    through here to tag AI content."""
    deck = _owned_deck_or_404(db, user, deck_id)
    card = Card(
        deck_id=deck.id,
        term=body.term.strip(),
        meaning=body.meaning.strip(),
        ipa=body.ipa,
        example_sentence=body.example_sentence,
        source=CardSource.manual,
    )
    db.add(card)
    db.commit()
    db.refresh(card)
    return card


@router.patch("/{deck_id}/cards/{card_id}", response_model=CardOut)
def update_card_in_my_deck(
    deck_id: int,
    card_id: int,
    body: StudentCardUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
) -> Card:
    deck = _owned_deck_or_404(db, user, deck_id)
    card = _owned_card_or_404(db, deck, card_id)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(card, field, value)
    db.commit()
    db.refresh(card)
    return card


@router.delete("/{deck_id}/cards/{card_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_card_in_my_deck(
    deck_id: int,
    card_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
) -> None:
    """Delete a card from a deck the student owns. Blocked once it has review
    history; otherwise drop the per-student scheduling state and remove it."""
    deck = _owned_deck_or_404(db, user, deck_id)
    card = _owned_card_or_404(db, deck, card_id)

    graded = db.scalar(select(func.count()).select_from(Review).where(Review.card_id == card_id))
    if graded:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This card has review history and can't be deleted.",
        )
    db.execute(CardState.__table__.delete().where(CardState.card_id == card_id))
    db.delete(card)
    db.commit()
