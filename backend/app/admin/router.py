from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth.deps import current_admin
from app.db import get_db
from app.models import Assignment, Card, CardState, Deck, Language, Review, User, UserRole
from app.schemas.auth import UserOut
from app.schemas.vocab import (
    AssignmentCreate,
    AssignmentOut,
    BulkEnrichItem,
    BulkEnrichRequest,
    CardCreate,
    CardOut,
    CardUpdate,
    ClassAssignmentCreate,
    DeckCreate,
    DeckOut,
    EnrichmentOut,
    EnrichRequest,
    StudentUpdate,
)
from app.vocab import enrichment

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(current_admin)])


def _assign_one(db: Session, student_id: int, deck_id: int, target: int | None) -> Assignment:
    """Create or reactivate one student↔deck assignment. Shared by the single
    and whole-class assign paths so their behaviour can't drift apart."""
    existing = db.scalar(
        select(Assignment).where(
            Assignment.student_id == student_id, Assignment.deck_id == deck_id
        )
    )
    if existing is not None:
        existing.active = True
        existing.daily_new_target = target
        return existing

    assignment = Assignment(student_id=student_id, deck_id=deck_id, daily_new_target=target)
    db.add(assignment)
    return assignment


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


@router.patch("/cards/{card_id}", response_model=CardOut)
def update_card(card_id: int, body: CardUpdate, db: Session = Depends(get_db)) -> Card:
    """Edit a card's fields, or move it to another deck by setting `deck_id`."""
    card = db.get(Card, card_id)
    if card is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Card not found")

    fields = body.model_dump(exclude_unset=True)
    if "deck_id" in fields and db.get(Deck, fields["deck_id"]) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deck not found")

    for name, value in fields.items():
        setattr(card, name, value)
    db.commit()
    db.refresh(card)
    return card


@router.delete("/cards/{card_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_card(card_id: int, db: Session = Depends(get_db)) -> None:
    """Delete a card. Blocked once it has review history — `reviews` is an
    append-only log we never destroy; drop the per-student scheduling state
    (regenerated lazily) and remove the card only when nothing has graded it."""
    card = db.get(Card, card_id)
    if card is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Card not found")

    graded = db.scalar(select(func.count()).select_from(Review).where(Review.card_id == card_id))
    if graded:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Card has review history and cannot be deleted",
        )

    db.execute(CardState.__table__.delete().where(CardState.card_id == card_id))
    db.delete(card)
    db.commit()


@router.post("/enrich", response_model=EnrichmentOut)
def enrich(body: EnrichRequest, db: Session = Depends(get_db)) -> EnrichmentOut:
    """Draft a card with AI for the teacher to review. Nothing is saved here."""
    try:
        draft = enrichment.enrich_term(body.term)
    except enrichment.EnrichmentError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
        ) from exc
    return EnrichmentOut(term=body.term.strip(), **draft.model_dump())


@router.post("/enrich/bulk", response_model=list[BulkEnrichItem])
def enrich_bulk(body: BulkEnrichRequest, db: Session = Depends(get_db)) -> list[BulkEnrichItem]:
    """Paste-a-list enrichment: one draft per term, failures reported per row so
    one bad word doesn't sink the batch."""
    if not enrichment.is_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI enrichment is not configured (no ANTHROPIC_API_KEY).",
        )

    items: list[BulkEnrichItem] = []
    for raw in body.terms:
        term = raw.strip()
        if not term:
            continue
        try:
            draft = enrichment.enrich_term(term)
            items.append(BulkEnrichItem(term=term, **draft.model_dump()))
        except enrichment.EnrichmentError as exc:
            items.append(BulkEnrichItem(term=term, error=str(exc)))
    return items


@router.patch("/students/{student_id}", response_model=UserOut)
def update_student(student_id: int, body: StudentUpdate, db: Session = Depends(get_db)) -> User:
    """Teacher edits to a student — including their daily new-card target."""
    student = db.get(User, student_id)
    if student is None or student.role is not UserRole.student:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found")

    for name, value in body.model_dump(exclude_unset=True).items():
        setattr(student, name, value)
    db.commit()
    db.refresh(student)
    return student


@router.post("/assignments", response_model=AssignmentOut, status_code=status.HTTP_201_CREATED)
def assign_deck(body: AssignmentCreate, db: Session = Depends(get_db)) -> Assignment:
    student = db.get(User, body.student_id)
    if student is None or student.role is not UserRole.student:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found")
    if db.get(Deck, body.deck_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deck not found")

    assignment = _assign_one(db, body.student_id, body.deck_id, body.daily_new_target)
    db.commit()
    db.refresh(assignment)
    return assignment


@router.post(
    "/assignments/class",
    response_model=list[AssignmentOut],
    status_code=status.HTTP_201_CREATED,
)
def assign_deck_to_class(
    body: ClassAssignmentCreate, db: Session = Depends(get_db)
) -> list[Assignment]:
    """Push a deck to every student at once (idempotent — reactivates existing)."""
    if db.get(Deck, body.deck_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deck not found")

    students = db.scalars(select(User).where(User.role == UserRole.student)).all()
    assignments = [
        _assign_one(db, s.id, body.deck_id, body.daily_new_target) for s in students
    ]
    db.commit()
    for a in assignments:
        db.refresh(a)
    return assignments
