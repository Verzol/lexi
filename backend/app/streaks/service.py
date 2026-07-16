"""Daily streak bookkeeping (SoW §4 M5).

A student's streak advances once per local day, the first time they grade any
card — review *or* quiz, since both paths funnel through `srs.grade_card`. We
deliberately count "did the student show up today" rather than "did they clear
every due card": the goal is a habit nudge, not a completion gate, and requiring
a fully empty queue would punish a student who has 40 cards due through no fault
of their own.

Freezes bridge missed days so a single skipped day doesn't wipe a long streak.
Each missed day costs one freeze; when the gap outruns the freezes on hand the
streak resets to 1 (today still counts — they're here now).
"""

from datetime import date, datetime
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Streak, User
from app.models.enums import UserRole


def _today_for(user: User) -> date:
    """The student's current calendar day in their own timezone — the streak's
    day boundary, matching how the SRS due-window is computed."""
    return datetime.now(ZoneInfo(user.timezone)).date()


def record_activity(db: Session, student_id: int) -> Streak | None:
    """Mark that the student was active today and advance the streak accordingly.

    Idempotent within a day: repeated calls after the first only no-op. Does not
    commit — the caller's transaction (e.g. `grade_card`) owns the commit so the
    streak tick and the review land atomically. Returns the row, or None for a
    non-student (admins have no streak).
    """
    user = db.get(User, student_id)
    if user is None or user.role is not UserRole.student:
        return None

    streak = db.scalar(select(Streak).where(Streak.student_id == student_id))
    if streak is None:
        # Normally created with the account, but be defensive.
        streak = Streak(student_id=student_id)
        db.add(streak)

    today = _today_for(user)
    last = streak.last_completed_date

    if last == today:
        return streak  # already counted today

    if last is None:
        streak.current_streak = 1
    else:
        gap = (today - last).days
        if gap <= 0:
            # Clock skew / timezone change put "today" at or before the last day.
            # Treat as already-counted rather than corrupt the streak.
            return streak
        missed = gap - 1
        if missed == 0:
            streak.current_streak += 1
        elif missed <= streak.freezes_remaining:
            streak.freezes_remaining -= missed
            streak.current_streak += 1
        else:
            streak.current_streak = 1

    streak.longest_streak = max(streak.longest_streak, streak.current_streak)
    streak.last_completed_date = today
    return streak
