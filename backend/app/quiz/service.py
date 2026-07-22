"""Auto-generated practice quiz (SoW §4): a short mix of multiple-choice and
type-the-answer questions drawn from cards the student already knows. Answers feed
the FSRS scheduler — a miss reschedules the card sooner — via `srs.grade_card`.

Generation stays stateless — the quiz isn't stored — but the *shape* of each
question is not something the client may choose. Which field counts as the
correct answer depends on `kind`, so a client-supplied `kind` would let a student
grade a type-the-answer question against the meaning that is sitting right there
on their screen. Each question therefore carries a short-lived signed token
binding `card_id` to `kind`; grading trusts the token, never the request body.
"""

import random
import re
from datetime import UTC, datetime, timedelta

import jwt
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import Card, CardState
from app.models.enums import CardStateEnum
from app.schemas.quiz import QuizKind, QuizQuestion
from app.srs.service import assigned_deck_ids, ensure_card_states

settings = get_settings()

# A quiz stays short so a session ends cleanly (SoW §4 soft cap).
QUIZ_LENGTH = 5
# An MCQ needs the correct meaning plus this many distractors.
_MCQ_DISTRACTORS = 3
# Long enough for an unhurried session, short enough that a token isn't a
# permanent licence to re-grade a card in whichever format is easiest.
_QUESTION_TOKEN_TTL = timedelta(hours=2)


class QuestionTokenError(Exception):
    """The submitted question token was missing, expired, forged, or for another card."""


def issue_question_token(card_id: int, kind: QuizKind) -> str:
    """Sign the (card, format) pair we actually asked, so grading can trust it."""
    now = datetime.now(UTC)
    payload = {
        "card_id": card_id,
        "kind": kind.value,
        "type": "quiz_question",
        "iat": now,
        "exp": now + _QUESTION_TOKEN_TTL,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_question_token(token: str, expected_card_id: int) -> QuizKind:
    """Recover the format this question was issued in. Raises QuestionTokenError."""
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except jwt.PyJWTError as exc:
        raise QuestionTokenError(str(exc)) from exc

    if payload.get("type") != "quiz_question":
        raise QuestionTokenError("not a quiz question token")
    # Without this, a token for an easy card could be replayed against a hard one.
    if payload.get("card_id") != expected_card_id:
        raise QuestionTokenError("token was issued for a different card")
    try:
        return QuizKind(payload.get("kind"))
    except ValueError as exc:
        raise QuestionTokenError("unknown question kind") from exc


def normalize(text: str) -> str:
    """Fold the trivial differences that shouldn't fail a type-the-answer: case,
    surrounding/duplicated whitespace, and surrounding punctuation."""
    return re.sub(r"\s+", " ", text.strip().lower()).strip(".,!?;:\"'")


def _blank_out_term(example: str | None, term: str) -> str | None:
    """Hide the term in its own example sentence so it can't give the answer away."""
    if not example:
        return None
    return re.sub(re.escape(term), "____", example, flags=re.IGNORECASE)


def generate_quiz(db: Session, student_id: int, length: int = QUIZ_LENGTH) -> list[QuizQuestion]:
    """Build a short quiz from the student's *known* cards — ones seen at least
    once (not in the `new` state). Returns an empty list when there's nothing to
    quiz yet, so a brand-new student simply skips the quiz."""
    ensure_card_states(db, student_id)
    deck_ids = assigned_deck_ids(db, student_id)
    if not deck_ids:
        return []

    known = list(
        db.scalars(
            select(Card)
            .join(CardState, CardState.card_id == Card.id)
            .where(
                CardState.student_id == student_id,
                Card.deck_id.in_(deck_ids),
                CardState.state != CardStateEnum.new,
            )
        )
    )
    if not known:
        return []

    # Distractors can come from any assigned card, not just the quizzed ones — a
    # wider pool for believable wrong options.
    meaning_pool = list(
        db.scalars(select(Card.meaning).where(Card.deck_id.in_(deck_ids)))
    )

    random.shuffle(known)
    questions: list[QuizQuestion] = []
    for i, card in enumerate(known[:length]):
        distractors = list({m for m in meaning_pool if m != card.meaning})
        # Alternate the two formats, but fall back to type-the-answer when the deck
        # is too small to offer believable MCQ distractors.
        want_mcq = i % 2 == 0 and len(distractors) >= _MCQ_DISTRACTORS
        if want_mcq:
            options = random.sample(distractors, _MCQ_DISTRACTORS) + [card.meaning]
            random.shuffle(options)
            questions.append(
                QuizQuestion(
                    card_id=card.id,
                    kind=QuizKind.mcq,
                    token=issue_question_token(card.id, QuizKind.mcq),
                    term=card.term,
                    ipa=card.ipa,
                    options=options,
                )
            )
        else:
            questions.append(
                QuizQuestion(
                    card_id=card.id,
                    kind=QuizKind.type_answer,
                    token=issue_question_token(card.id, QuizKind.type_answer),
                    meaning=card.meaning,
                    example_sentence=_blank_out_term(card.example_sentence, card.term),
                )
            )
    return questions


def check_answer(card: Card, kind: QuizKind, answer: str) -> tuple[bool, str]:
    """Grade one submitted answer against the card. Returns (correct, correct_answer).
    For MCQ the answer is a chosen meaning; for type-the-answer it's the typed term."""
    expected = card.meaning if kind is QuizKind.mcq else card.term
    return normalize(answer) == normalize(expected), expected
