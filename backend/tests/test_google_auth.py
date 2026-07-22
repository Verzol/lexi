"""M7: Google sign-in. The Google SDK is stubbed via verify_google_credential so
the tests never hit the network."""

import pytest
from sqlalchemy import select

from app.auth import router as auth_router
from app.auth.google import GoogleIdentity
from app.models import User


@pytest.fixture
def fake_google(monkeypatch):
    """Make /auth/google trust a canned identity instead of calling Google."""

    def _install(
        email: str, *, sub: str = "google-sub-1", verified: bool = True, name: str = "Google User"
    ):
        identity = GoogleIdentity(sub=sub, email=email, email_verified=verified, name=name)
        monkeypatch.setattr(auth_router, "verify_google_credential", lambda _cred: identity)

    return _install


def test_google_creates_a_new_student(client, db_session, fake_google):
    fake_google("newbie@gmail.com")
    resp = client.post("/auth/google", json={"credential": "x"})
    assert resp.status_code == 200, resp.text

    body = resp.json()
    assert body["access_token"]
    assert body["user"]["auth_provider"] == "google"
    assert body["user"]["email_verified"] is True

    user = db_session.scalar(select(User).where(User.email == "newbie@gmail.com"))
    assert user.password_hash is None
    assert user.google_sub == "google-sub-1"


def test_google_links_to_an_existing_account_by_email(client, db_session, seeded, fake_google):
    fake_google("mai@lexi.app", sub="google-sub-mai")
    resp = client.post("/auth/google", json={"credential": "x"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["user"]["id"] == seeded["student"].id

    user = db_session.scalar(select(User).where(User.email == "mai@lexi.app"))
    assert user.google_sub == "google-sub-mai"


def test_google_rejects_an_unverified_email(client, fake_google):
    fake_google("spoofed@gmail.com", verified=False)
    resp = client.post("/auth/google", json={"credential": "x"})
    assert resp.status_code == 401


def test_google_is_503_when_not_configured(client):
    # No monkeypatch: the real verifier sees no GOOGLE_CLIENT_ID and refuses.
    resp = client.post("/auth/google", json={"credential": "x"})
    assert resp.status_code == 503
