"""Background jobs (APScheduler). Currently one: the hourly reminder tick.

The job runs at the top of every UTC hour and delegates to
`streaks.reminders.send_daily_reminders`, which itself decides who is actually at
their local reminder hour. Running hourly (rather than once a day) is what lets a
single process serve students across many timezones without per-user timers.

Deliberately in-process: one small app, ~12 students. No Celery, no separate
worker — that's Phase-2 scale infra the SoW defers.
"""

import logging

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from app.config import get_settings
from app.db import SessionLocal
from app.streaks.reminders import send_daily_reminders

logger = logging.getLogger("app.jobs")

_scheduler: BackgroundScheduler | None = None


def _reminder_tick() -> None:
    db = SessionLocal()
    try:
        count = send_daily_reminders(db)
        if count:
            logger.info("Daily reminder tick: nudged %d student(s)", count)
    except Exception:
        logger.exception("Daily reminder tick failed")
    finally:
        db.close()


def start_scheduler() -> BackgroundScheduler | None:
    """Start the background scheduler. No-op (returns None) when reminders are
    disabled — which is how the test suite keeps the thread from spinning up."""
    global _scheduler
    settings = get_settings()
    if not settings.reminder_enabled:
        logger.info("Reminders disabled; scheduler not started")
        return None
    if _scheduler is not None:
        return _scheduler

    _scheduler = BackgroundScheduler(timezone="UTC")
    _scheduler.add_job(
        _reminder_tick,
        CronTrigger(minute=0),  # top of every hour, UTC
        id="daily-reminders",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )
    _scheduler.start()
    logger.info("Reminder scheduler started (hour=%d local)", settings.reminder_hour)
    return _scheduler


def shutdown_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
