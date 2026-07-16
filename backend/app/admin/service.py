"""Admin dashboard metrics (SoW §4 M6): per-student progress and "who's slipping".

Everything here is derived from the immutable `reviews` log plus the per-student
`streaks` and scheduling state — no new tables. For a ~12-student class a handful
of grouped aggregates is plenty; this deliberately doesn't reach for any
analytics infrastructure the docs defer to Phase 2.
"""

from datetime import UTC, datetime, timedelta

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.models import Assignment, Card, CardState, Deck, Review, Streak, User
from app.models.enums import CardStateEnum, Rating, UserRole
from app.schemas.admin import DashboardOut, DashboardStudent, DashboardSummary, DeckProgress
from app.srs.service import card_count_by_deck, due_count_by_deck, ensure_card_states

# No graded review in this many days → flagged as slipping (SoW §4 "no activity
# in N days"). A never-active student is measured from signup, not flagged on
# day one.
SLIP_DAYS = 5
WEEK_DAYS = 7


def _accuracy_pct(correct: int, total: int) -> int | None:
    return round(correct / total * 100) if total else None


def build_dashboard(db: Session) -> DashboardOut:
    now = datetime.now(UTC)
    week_ago = now - timedelta(days=WEEK_DAYS)

    students = db.scalars(
        select(User).where(User.role == UserRole.student).order_by(User.display_name)
    ).all()

    streaks = {s.student_id: s.current_streak for s in db.scalars(select(Streak))}

    # All-time per-student: last activity, review count, and how many were recalled
    # (anything but "again" is a successful recall).
    correct_case = case((Review.rating != Rating.again, 1), else_=0)
    all_time = {
        row.student_id: row
        for row in db.execute(
            select(
                Review.student_id.label("student_id"),
                func.max(Review.reviewed_at).label("last_active"),
                func.count().label("total"),
                func.coalesce(func.sum(correct_case), 0).label("correct"),
            ).group_by(Review.student_id)
        )
    }
    reviewed_week = {
        student_id: count
        for student_id, count in db.execute(
            select(Review.student_id, func.count())
            .where(Review.reviewed_at >= week_ago)
            .group_by(Review.student_id)
        )
    }

    rows: list[DashboardStudent] = []
    class_correct = class_total = 0
    active_this_week = slipping_count = reviewed_week_total = 0

    for s in students:
        # Materialize any not-yet-seen cards so due counts are real even for a
        # student who has never opened the app (same lazy path the student read uses).
        ensure_card_states(db, s.id)
        due = sum(due_count_by_deck(db, s.id).values())

        agg = all_time.get(s.id)
        last_active = agg.last_active if agg else None
        total = int(agg.total) if agg else 0
        correct = int(agg.correct) if agg else 0
        rw = reviewed_week.get(s.id, 0)

        # Days since last activity, falling back to account age when never active.
        baseline = last_active or s.created_at
        days_inactive = (now - baseline).days if baseline is not None else None
        slipping = days_inactive is not None and days_inactive >= SLIP_DAYS

        rows.append(
            DashboardStudent(
                id=s.id,
                display_name=s.display_name,
                email=s.email,
                current_streak=streaks.get(s.id, 0),
                last_active_at=last_active,
                days_inactive=days_inactive,
                due_count=due,
                reviewed_week=rw,
                accuracy=_accuracy_pct(correct, total),
                slipping=slipping,
            )
        )

        class_correct += correct
        class_total += total
        reviewed_week_total += rw
        if rw > 0:
            active_this_week += 1
        if slipping:
            slipping_count += 1

    summary = DashboardSummary(
        total_students=len(students),
        active_this_week=active_this_week,
        reviewed_week=reviewed_week_total,
        avg_accuracy=_accuracy_pct(class_correct, class_total),
        slipping_count=slipping_count,
    )
    return DashboardOut(students=rows, summary=summary, decks=build_deck_progress(db))


def build_deck_progress(db: Session) -> list[DeckProgress]:
    """Progress for each *class* deck — one owned by the teacher. Personal
    student-authored decks are theirs alone and excluded here."""
    class_decks = db.scalars(
        select(Deck)
        .join(User, User.id == Deck.owner_id)
        .where(User.role == UserRole.admin)
        .order_by(Deck.name)
    ).all()
    if not class_decks:
        return []

    deck_ids = [d.id for d in class_decks]
    card_counts = card_count_by_deck(db, deck_ids)

    # Distinct students actively assigned each deck.
    assigned = {
        deck_id: n
        for deck_id, n in db.execute(
            select(Assignment.deck_id, func.count(func.distinct(Assignment.student_id)))
            .join(User, User.id == Assignment.student_id)
            .where(
                Assignment.deck_id.in_(deck_ids),
                Assignment.active.is_(True),
                User.role == UserRole.student,
            )
            .group_by(Assignment.deck_id)
        )
    }

    # Per-deck totals of scheduling state and how many have graduated to `review`.
    mastered_case = case((CardState.state == CardStateEnum.review, 1), else_=0)
    states = {
        row.deck_id: row
        for row in db.execute(
            select(
                Card.deck_id.label("deck_id"),
                func.count().label("total"),
                func.coalesce(func.sum(mastered_case), 0).label("mastered"),
            )
            .join(Card, Card.id == CardState.card_id)
            .where(Card.deck_id.in_(deck_ids))
            .group_by(Card.deck_id)
        )
    }

    progress: list[DeckProgress] = []
    for d in class_decks:
        st = states.get(d.id)
        total = int(st.total) if st else 0
        mastered = int(st.mastered) if st else 0
        progress.append(
            DeckProgress(
                id=d.id,
                name=d.name,
                exam_tag=d.exam_tag,
                card_count=card_counts.get(d.id, 0),
                students_assigned=assigned.get(d.id, 0),
                mastered_pct=_accuracy_pct(mastered, total),
            )
        )
    return progress
