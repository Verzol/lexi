"""M7: signup email verification (soft gate — signup still logs the user in)."""

from sqlalchemy import select

from app.auth.security import create_email_verify_token
from app.models import User


def _register(client):
    return client.post(
        "/auth/register",
        json={
            "email": "newbie@lexi.app",
            "display_name": "Newbie",
            "password": "correcthorse",
        },
    )


def test_new_signup_starts_unverified_but_logged_in(client, db_session):
    resp = _register(client)
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["user"]["email_verified"] is False
    assert body["user"]["auth_provider"] == "local"
    # Logged in immediately (soft gate).
    assert body["access_token"]


def test_verify_email_flips_the_flag(client, db_session):
    _register(client)
    user = db_session.scalar(select(User).where(User.email == "newbie@lexi.app"))
    token = create_email_verify_token(user.id)

    resp = client.post("/auth/verify-email", json={"token": token})
    assert resp.status_code == 200, resp.text
    assert resp.json()["email_verified"] is True

    # Idempotent — clicking the link twice is fine.
    assert client.post("/auth/verify-email", json={"token": token}).status_code == 200


def test_verify_email_rejects_a_garbage_token(client):
    resp = client.post("/auth/verify-email", json={"token": "not-a-real-token"})
    assert resp.status_code == 400


def test_seeded_accounts_are_already_verified(client, student_auth):
    me = client.get("/auth/me", headers=student_auth)
    assert me.status_code == 200
    # The `seeded` fixture predates verification; treat it as confirmed.
    assert me.json()["email_verified"] is True
