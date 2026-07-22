from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth.deps import current_user
from app.db import get_db
from app.models import Card, User
from app.models.enums import Rating, ReviewSource
from app.quiz.service import (
    QuestionTokenError,
    check_answer,
    decode_question_token,
    generate_quiz,
)
from app.schemas.quiz import QuizAnswerIn, QuizAnswerOut, QuizQuestion
from app.srs.service import ensure_card_states, fetch_owned_card_state, grade_card

router = APIRouter(prefix="/quiz", tags=["quiz"])


@router.get("", response_model=list[QuizQuestion])
def get_quiz(
    db: Session = Depends(get_db), user: User = Depends(current_user)
) -> list[QuizQuestion]:
    """A short auto-generated quiz over the student's known cards. Empty if none."""
    return generate_quiz(db, user.id)


@router.post("/answer", response_model=QuizAnswerOut)
def answer_quiz(
    body: QuizAnswerIn, db: Session = Depends(get_db), user: User = Depends(current_user)
) -> QuizAnswerOut:
    """Grade one quiz answer and feed the result to FSRS: a hit grades `good`, a
    miss grades `again` so the card comes back sooner (SoW §4)."""
    ensure_card_states(db, user.id)

    # The format comes from the token we signed when serving the question, never
    # from the request body — otherwise a student could grade a type-the-answer
    # question against the meaning already displayed to them.
    try:
        kind = decode_question_token(body.token, body.card_id)
    except QuestionTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This question has expired. Start a new quiz.",
        ) from exc

    # Only the student's own card in an assigned deck can be answered (a miss 404s).
    cs = fetch_owned_card_state(db, user.id, body.card_id)
    if cs is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Card not found")

    card = db.get(Card, body.card_id)
    correct, correct_answer = check_answer(card, kind, body.answer)

    rating = Rating.good if correct else Rating.again
    cs = grade_card(db, cs, rating, body.elapsed_ms, source=ReviewSource.quiz)

    return QuizAnswerOut(
        card_id=cs.card_id,
        correct=correct,
        correct_answer=correct_answer,
        state=cs.state,
        due_at=cs.due_at,
    )
