"""Auto-generated practice quiz (SoW §4): a short mix of multiple-choice and
type-the-answer questions drawn from cards the student already knows. Answers feed
the FSRS scheduler — a miss reschedules the card sooner — via `srs.grade_card`.

Generation is stateless: the quiz isn't stored, and grading in the router
re-derives the correct answer from the card itself, so there's nothing to persist
between serving a quiz and grading it.
"""

import random
import re

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Card, CardState
from app.models.enums import CardStateEnum
from app.schemas.quiz import QuizKind, QuizQuestion
from app.srs.service import assigned_deck_ids, ensure_card_states

# A quiz stays short so a session ends cleanly (SoW §4 soft cap).
QUIZ_LENGTH = 5
# An MCQ needs the correct meaning plus this many distractors.
_MCQ_DISTRACTORS = 3


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
