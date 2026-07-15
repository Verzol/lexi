from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel

from app.models.enums import CardStateEnum


class QuizKind(StrEnum):
    """The two quiz formats from SoW §4. API-only — never persisted, so it lives
    here beside the request/response shapes rather than in `models/enums.py`."""

    mcq = "mcq"
    type_answer = "type_answer"


class QuizQuestion(BaseModel):
    """One generated question. Only the fields the given `kind` needs are set:
    the correct answer is never sent — grading happens server-side in `/quiz/answer`.

    - mcq: `term` + `ipa` shown, `options` are meanings to choose between.
    - type_answer: `meaning` (+ blanked `example_sentence`) shown, student types the term.
    """

    card_id: int
    kind: QuizKind
    # Shown for mcq (the word to match); withheld for type_answer (it's the answer).
    term: str | None = None
    ipa: str | None = None
    # Shown for type_answer (the definition); withheld for mcq (it's the answer).
    meaning: str | None = None
    # type_answer only: the example with the term blanked out, so it can't give the answer away.
    example_sentence: str | None = None
    # mcq only: the shuffled meaning choices, exactly one of which is correct.
    options: list[str] | None = None


class QuizAnswerIn(BaseModel):
    card_id: int
    kind: QuizKind
    # The chosen option text (mcq) or the typed term (type_answer).
    answer: str
    # How long the student spent, for analytics — optional.
    elapsed_ms: int | None = None


class QuizAnswerOut(BaseModel):
    """The verdict for one answer. A miss feeds the scheduler as `again` so the
    card comes back sooner; a hit feeds it as `good` (SoW §4: quizzes feed FSRS)."""

    card_id: int
    correct: bool
    # The real answer, revealed after grading so the student learns from a miss.
    correct_answer: str
    state: CardStateEnum
    due_at: datetime
