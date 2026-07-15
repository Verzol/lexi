from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth.deps import current_user
from app.db import get_db
from app.models import User
from app.schemas.srs import GradeIn, GradeOut, ReviewCardOut
from app.srs.service import (
    due_queue,
    ensure_card_states,
    fetch_owned_card_state,
    grade_card,
)

router = APIRouter(prefix="/review", tags=["review"])


@router.get("/due", response_model=list[ReviewCardOut])
def review_due(
    db: Session = Depends(get_db), user: User = Depends(current_user)
) -> list[ReviewCardOut]:
    """The student's queue for right now — due review cards plus rationed new cards."""
    ensure_card_states(db, user.id)
    return [
        ReviewCardOut(
            card_id=card.id,
            deck_id=card.deck_id,
            term=card.term,
            meaning=card.meaning,
            ipa=card.ipa,
            example_sentence=card.example_sentence,
            image_url=card.image_url,
            audio_url=card.audio_url,
            exam_tag=deck.exam_tag,
            state=cs.state,
            due_at=cs.due_at,
        )
        for cs, card, deck in due_queue(db, user.id)
    ]


@router.post("/grade", response_model=GradeOut)
def review_grade(
    body: GradeIn, db: Session = Depends(get_db), user: User = Depends(current_user)
) -> GradeOut:
    """Record one grade and reschedule the card via FSRS."""
    # A card the student has been assigned but never loaded has no state row yet;
    # materialize lazily so grading doesn't depend on `/review/due` running first.
    ensure_card_states(db, user.id)

    # Only the student's own card in an assigned deck can be graded (a miss 404s).
    cs = fetch_owned_card_state(db, user.id, body.card_id)
    if cs is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Card not found")

    cs = grade_card(db, cs, body.rating, body.elapsed_ms)
    return GradeOut(card_id=cs.card_id, state=cs.state, due_at=cs.due_at, reps=cs.reps)
