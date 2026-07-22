from datetime import UTC, datetime
from zoneinfo import ZoneInfo

from fsrs import Card as FsrsCard
from fsrs import Rating as FsrsRating
from fsrs import Scheduler
from fsrs import State as FsrsState
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Assignment, Card, CardState, Deck, Review, User
from app.models.enums import CardStateEnum, Rating, ReviewSource
from app.streaks.service import record_activity

# One scheduler with FSRS defaults (desired retention 0.9). Fuzzing is disabled so
# a given card + rating always yields the same interval — reviews stay predictable
# for a teacher-curated, ~12-student app, and tests can assert on the outcome.
_scheduler = Scheduler(enable_fuzzing=False)

_RATING_TO_FSRS: dict[Rating, FsrsRating] = {
    Rating.again: FsrsRating.Again,
    Rating.hard: FsrsRating.Hard,
    Rating.good: FsrsRating.Good,
    Rating.easy: FsrsRating.Easy,
}

# FSRS has no "new": a card that has never been reviewed is a fresh Learning card.
_ENUM_TO_FSRS_STATE: dict[CardStateEnum, FsrsState] = {
    CardStateEnum.learning: FsrsState.Learning,
    CardStateEnum.review: FsrsState.Review,
    CardStateEnum.lapsed: FsrsState.Relearning,
}
_FSRS_STATE_TO_ENUM: dict[FsrsState, CardStateEnum] = {
    FsrsState.Learning: CardStateEnum.learning,
    FsrsState.Review: CardStateEnum.review,
    FsrsState.Relearning: CardStateEnum.lapsed,
}


def assigned_deck_ids(db: Session, student_id: int) -> list[int]:
    return list(
        db.scalars(
            select(Assignment.deck_id).where(
                Assignment.student_id == student_id, Assignment.active.is_(True)
            )
        )
    )


def ensure_card_states(db: Session, student_id: int, commit: bool = True) -> int:
    """
    Lazily materialize a CardState row for every card in the student's active
    decks. New cards a teacher adds to an already-assigned deck get picked up
    here on the student's next request. Returns the number of rows created.

    `commit=False` flushes instead of committing, so a caller iterating over
    many students (the admin dashboard) can fold every write into one commit
    rather than committing once per student on a read.
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
    if commit:
        db.commit()
    else:
        db.flush()
    return len(missing)


def _start_of_day_utc(tz: str) -> datetime:
    """Midnight today in the student's own timezone, expressed in UTC."""
    local_now = datetime.now(ZoneInfo(tz))
    start_local = local_now.replace(hour=0, minute=0, second=0, microsecond=0)
    return start_local.astimezone(UTC)


def _effective_new_targets(db: Session, student_id: int, default: int) -> dict[int, int]:
    """Per-deck daily new-card target: the assignment override, else the student's own."""
    rows = db.execute(
        select(Assignment.deck_id, Assignment.daily_new_target).where(
            Assignment.student_id == student_id, Assignment.active.is_(True)
        )
    ).all()
    return {deck_id: (target if target is not None else default) for deck_id, target in rows}


def _new_started_today_by_deck(db: Session, student_id: int, tz: str) -> dict[int, int]:
    """
    How many *new* cards the student has already begun today, per deck — a card
    counts once its first review lands in today's local window. Drives the cap
    so a fresh session doesn't dump a whole 300-card deck at once.
    """
    start = _start_of_day_utc(tz)
    first_review = (
        select(Review.card_id, func.min(Review.reviewed_at).label("first_at"))
        .where(Review.student_id == student_id)
        .group_by(Review.card_id)
        .subquery()
    )
    rows = db.execute(
        select(Card.deck_id, func.count())
        .select_from(first_review)
        .join(Card, Card.id == first_review.c.card_id)
        .where(first_review.c.first_at >= start)
        .group_by(Card.deck_id)
    ).all()
    return {deck_id: count for deck_id, count in rows}


def due_queue(db: Session, student_id: int) -> list[tuple[CardState, Card, Deck]]:
    """
    The cards to serve right now: every review-state card that's due, plus new
    cards up to each deck's remaining daily target. Single source of truth for
    both `/review/due` and the deck due-counts on Home, so they never disagree.
    """
    deck_ids = assigned_deck_ids(db, student_id)
    if not deck_ids:
        return []

    now = datetime.now(UTC)
    base = (
        select(CardState, Card, Deck)
        .join(Card, Card.id == CardState.card_id)
        .join(Deck, Deck.id == Card.deck_id)
        .where(
            CardState.student_id == student_id,
            Card.deck_id.in_(deck_ids),
            CardState.due_at <= now,
        )
    )

    # Cards already in progress are always served — the student committed to them.
    review_rows = list(
        db.execute(
            base.where(CardState.state != CardStateEnum.new).order_by(CardState.due_at)
        ).all()
    )

    # New cards are rationed by the daily target so sessions stay short.
    student = db.get(User, student_id)
    targets = _effective_new_targets(db, student_id, student.daily_new_target)
    started = _new_started_today_by_deck(db, student_id, student.timezone)
    remaining = {
        deck_id: max(0, targets.get(deck_id, student.daily_new_target) - started.get(deck_id, 0))
        for deck_id in deck_ids
    }

    new_rows: list[tuple[CardState, Card, Deck]] = []
    candidates = db.execute(
        base.where(CardState.state == CardStateEnum.new).order_by(Card.deck_id, Card.id)
    ).all()
    for cs, card, deck in candidates:
        if remaining.get(card.deck_id, 0) > 0:
            new_rows.append((cs, card, deck))
            remaining[card.deck_id] -= 1

    return review_rows + new_rows


def _to_fsrs_card(cs: CardState) -> FsrsCard:
    if cs.state is CardStateEnum.new:
        # A never-reviewed card is a fresh FSRS card: Learning, step 0, no memory yet.
        return FsrsCard(due=cs.due_at)
    return FsrsCard(
        state=_ENUM_TO_FSRS_STATE[cs.state],
        step=cs.step,
        stability=cs.stability,
        difficulty=cs.difficulty,
        due=cs.due_at,
        last_review=cs.last_reviewed_at,
    )


def fetch_owned_card_state(db: Session, student_id: int, card_id: int) -> CardState | None:
    """The student's own scheduling state for one card, or None if it isn't theirs
    to grade. A miss must surface as a 404, not a 403 — the API never confirms a
    card exists to someone who can't see it. Shared by the review and quiz paths so
    they can't drift apart on this boundary. Call `ensure_card_states` first.
    """
    return db.scalar(
        select(CardState)
        .join(Card, Card.id == CardState.card_id)
        .where(
            CardState.student_id == student_id,
            CardState.card_id == card_id,
            Card.deck_id.in_(assigned_deck_ids(db, student_id)),
        )
    )


def grade_card(
    db: Session,
    cs: CardState,
    rating: Rating,
    elapsed_ms: int | None = None,
    source: ReviewSource = ReviewSource.review,
) -> CardState:
    """
    Apply one grade: advance the FSRS schedule on the card's state and append an
    immutable Review row. `cs` must already be confirmed as the student's own.
    `source` tags where the grade came from (review vs quiz) for the analytics log.
    """
    now = datetime.now(UTC)
    was_review = cs.state is CardStateEnum.review

    updated, _log = _scheduler.review_card(
        _to_fsrs_card(cs), _RATING_TO_FSRS[rating], review_datetime=now, review_duration=elapsed_ms
    )

    cs.state = _FSRS_STATE_TO_ENUM[updated.state]
    cs.step = updated.step
    cs.stability = updated.stability
    cs.difficulty = updated.difficulty
    cs.due_at = updated.due
    cs.last_reviewed_at = updated.last_review or now
    cs.reps += 1
    # A lapse is a card that had graduated to Review and was then forgotten.
    if rating is Rating.again and was_review:
        cs.lapses += 1

    db.add(
        Review(
            student_id=cs.student_id,
            card_id=cs.card_id,
            rating=rating,
            elapsed_ms=elapsed_ms,
            reviewed_at=now,
            source=source,
        )
    )
    # Showing up today advances the daily streak (review or quiz — both land here),
    # in the same transaction as the review so the two can't disagree.
    record_activity(db, cs.student_id)
    db.commit()
    db.refresh(cs)
    return cs


def due_count_by_deck(db: Session, student_id: int) -> dict[int, int]:
    """Cards the student would actually be served now, grouped by deck."""
    counts: dict[int, int] = {}
    for _cs, card, _deck in due_queue(db, student_id):
        counts[card.deck_id] = counts.get(card.deck_id, 0) + 1
    return counts


def card_count_by_deck(db: Session, deck_ids: list[int]) -> dict[int, int]:
    if not deck_ids:
        return {}
    rows = db.execute(
        select(Card.deck_id, func.count(Card.id))
        .where(Card.deck_id.in_(deck_ids))
        .group_by(Card.deck_id)
    ).all()
    return {deck_id: count for deck_id, count in rows}
