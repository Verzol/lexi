"""Google sign-in via the Identity Services ID-token flow.

The frontend obtains a Google ID token (a signed JWT) and posts it here; we
verify its signature and audience against Google, then trust the email it
asserts. No client secret and no server-side redirect/callback is needed for
this flow — just the OAuth *Client ID* (`google_client_id`).

Isolated behind `verify_google_credential` so the router doesn't touch the
Google SDK directly and tests can substitute a fake identity.
"""

from google.auth.transport import requests as google_requests
from google.oauth2 import id_token
from pydantic import BaseModel

from app.config import get_settings


class GoogleIdentity(BaseModel):
    sub: str
    email: str
    email_verified: bool
    name: str | None = None


class GoogleAuthError(RuntimeError):
    """Raised when Google sign-in is unconfigured or the credential is invalid."""


class GoogleNotConfigured(GoogleAuthError):
    """No `google_client_id` is set — the feature is off."""


def verify_google_credential(credential: str) -> GoogleIdentity:
    settings = get_settings()
    if not settings.google_client_id:
        raise GoogleNotConfigured("Google sign-in is not configured (no GOOGLE_CLIENT_ID).")

    try:
        info = id_token.verify_oauth2_token(
            credential, google_requests.Request(), settings.google_client_id
        )
    except ValueError as exc:  # bad signature, wrong audience, expired, etc.
        raise GoogleAuthError("Invalid Google credential.") from exc

    if not info.get("email"):
        raise GoogleAuthError("Google account did not provide an email address.")

    return GoogleIdentity(
        sub=info["sub"],
        email=info["email"],
        email_verified=bool(info.get("email_verified")),
        name=info.get("name"),
    )
