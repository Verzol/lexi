"""Tiny outbound-email helper. One backend (SMTP) with a console fallback.

When `smtp_host` is unconfigured — dev, CI, the test suite — the message is
logged instead of sent, so nothing ever hits the network without explicit
configuration. This is the only place the app talks SMTP; keep it that way.
"""

import logging
import smtplib
from email.message import EmailMessage

from app.config import get_settings

logger = logging.getLogger("app.email")


def send_email(to: str, subject: str, body: str) -> bool:
    """Send a plain-text email. Returns True if it was actually handed to an SMTP
    server, False if it was only logged (no SMTP configured)."""
    settings = get_settings()

    if not settings.smtp_host:
        logger.info(
            "EMAIL (not sent — no SMTP configured)\n  to=%s\n  subject=%s\n%s",
            to,
            subject,
            body,
        )
        return False

    msg = EmailMessage()
    msg["From"] = settings.reminder_from
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
        if settings.smtp_starttls:
            server.starttls()
        if settings.smtp_user:
            server.login(settings.smtp_user, settings.smtp_password or "")
        server.send_message(msg)

    logger.info("Email sent to %s (subject=%s)", to, subject)
    return True


def send_verification_email(to: str, display_name: str, verify_url: str) -> bool:
    """Email the signup verification link. Logged, not sent, without SMTP."""
    body = (
        f"Hi {display_name},\n\n"
        "Confirm your email to finish setting up your Lexi account:\n\n"
        f"    {verify_url}\n\n"
        "If you didn't create this account, you can ignore this email.\n\n"
        "— Lexi"
    )
    return send_email(to, "Confirm your Lexi email", body)
