"""M5 daily reminders: the right students are nudged at their local reminder
hour, exactly once a day, and only when they have work and haven't studied."""

from datetime import UTC, date, datetime, timedelta

from app.config import get_settings
from app.models import Streak
from app.streaks.reminders import send_daily_reminders, students_due_reminder

# The seeded student is in Asia/Ho_Chi_Minh (UTC+7). Reminder hour defaults to 19
# local, so 19:00 local == 12:00 UTC.
HOUR = get_settings().reminder_hour
AT_LOCAL_HOUR = datetime(2026, 7, 16, HOUR - 7, 0, tzinfo=UTC)  # 12:00 UTC when HOUR=19
OFF_HOUR = datetime(2026, 7, 16, HOUR - 7 + 2, 0, tzinfo=UTC)  # two hours later, local


def test_nudged_at_local_reminder_hour(db_session, seeded):
    due = students_due_reminder(db_session, AT_LOCAL_HOUR)
    # `student` is assigned a deck; `other` is not, so only `student` qualifies.
    assert [u.email for u in due] == ["mai@lexi.app"]


def test_not_nudged_outside_the_reminder_hour(db_session, seeded):
    assert students_due_reminder(db_session, OFF_HOUR) == []


def test_not_nudged_after_studying_today(db_session, seeded):
    streak = db_session.query(Streak).filter_by(student_id=seeded["student"].id).one()
    streak.last_completed_date = date(2026, 7, 16)  # already active today, local
    db_session.commit()
    assert students_due_reminder(db_session, AT_LOCAL_HOUR) == []


def test_unassigned_student_is_never_nudged(db_session, seeded):
    # `other` has no assignment; confirm they're absent even at their reminder hour.
    due = students_due_reminder(db_session, AT_LOCAL_HOUR)
    assert seeded["other"].email not in [u.email for u in due]


def test_unverified_student_is_never_nudged(db_session, seeded):
    """Public signup means an address can be a typo or invented; don't bounce
    mail at it daily. Studying is unaffected — only email is withheld."""
    student = seeded["student"]
    student.email_verified = False
    db_session.commit()

    assert students_due_reminder(db_session, AT_LOCAL_HOUR) == []
    assert send_daily_reminders(db_session, AT_LOCAL_HOUR) == 0

    # Verifying the address lets the nudge through again.
    student.email_verified = True
    db_session.commit()
    assert [u.email for u in students_due_reminder(db_session, AT_LOCAL_HOUR)] == ["mai@lexi.app"]


def test_send_marks_reminded_and_is_idempotent_for_the_day(db_session, seeded):
    sent = send_daily_reminders(db_session, AT_LOCAL_HOUR)
    assert sent == 1

    streak = db_session.query(Streak).filter_by(student_id=seeded["student"].id).one()
    assert streak.last_reminded_date == date(2026, 7, 16)

    # A second tick in the same hour must not send again.
    assert send_daily_reminders(db_session, AT_LOCAL_HOUR + timedelta(minutes=1)) == 0
