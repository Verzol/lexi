"""Daily reminder selection + delivery (SoW §4 M5).

The scheduler ticks hourly; on each tick this module finds the students for whom
it's now the reminder hour in *their* timezone and who haven't studied today, and
emails each a nudge. `last_reminded_date` makes the send idempotent for the day.

Kept independent of APScheduler so it's directly testable: `students_due_reminder`
is a pure read, and `send_daily_reminders` takes an explicit `now_utc`.
"""

import logging
from datetime import UTC, date, datetime
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.email import send_email
from app.models import Streak, User
from app.models.enums import UserRole
from app.srs.service import assigned_deck_ids

logger = logging.getLogger("app.reminders")


def _local(now_utc: datetime, tz: str) -> datetime:
    return now_utc.astimezone(ZoneInfo(tz))


def _already_active_today(streak: Streak | None, today: date) -> bool:
    return streak is not None and streak.last_completed_date == today


def _already_reminded_today(streak: Streak | None, today: date) -> bool:
    return streak is not None and streak.last_reminded_date == today


def students_due_reminder(db: Session, now_utc: datetime) -> list[User]:
    """Students to nudge right now: it's their local reminder hour, they haven't
    studied today, haven't already been reminded today, and actually have work
    assigned (an unassigned student gets no pointless nag).

    Unverified accounts are skipped. Self-signup is public, so an address may be
    a typo or invented; nagging it daily just bounces mail forever and burns the
    sending reputation of whatever account is configured in SMTP_*. This does not
    tighten the soft gate — an unverified student still studies and still keeps a
    streak, they just don't get email until the address is known to be real.
    """
    settings = get_settings()
    students = db.scalars(
        select(User).where(User.role == UserRole.student, User.email_verified.is_(True))
    ).all()

    due: list[User] = []
    for student in students:
        local = _local(now_utc, student.timezone)
        if local.hour != settings.reminder_hour:
            continue
        today = local.date()
        streak = db.scalar(select(Streak).where(Streak.student_id == student.id))
        if _already_active_today(streak, today) or _already_reminded_today(streak, today):
            continue
        if not assigned_deck_ids(db, student.id):
            continue
        due.append(student)
    return due


def _reminder_body(student: User) -> tuple[str, str]:
    settings = get_settings()
    subject = "Your Lexi review is waiting"
    body = (
        f"Hi {student.display_name},\n\n"
        "You haven't done your English review yet today. A few minutes now keeps "
        "your streak alive and the words fresh.\n\n"
        f"Pick up where you left off: {settings.app_base_url}/review\n\n"
        "— Lexi"
    )
    return subject, body


def send_daily_reminders(db: Session, now_utc: datetime | None = None) -> int:
    """Send today's reminder to everyone currently due. Returns the number of
    students reminded. Marks `last_reminded_date` so a second tick within the
    hour (or a restart) won't double-send."""
    now_utc = now_utc or datetime.now(UTC)
    recipients = students_due_reminder(db, now_utc)

    sent = 0
    for student in recipients:
        subject, body = _reminder_body(student)
        try:
            send_email(student.email, subject, body)
        except Exception:
            # A single bad address must not stop the rest of the batch.
            logger.exception("Failed to send reminder to %s", student.email)
            continue

        streak = db.scalar(select(Streak).where(Streak.student_id == student.id))
        if streak is None:
            streak = Streak(student_id=student.id)
            db.add(streak)
        streak.last_reminded_date = _local(now_utc, student.timezone).date()
        sent += 1

    db.commit()
    return sent
