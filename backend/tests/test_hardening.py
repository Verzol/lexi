"""M7 hardening: timezone validation at signup, per-IP login rate limiting, and
the production secret guard."""

import pytest

from app import ratelimit
from app.config import Settings, get_settings
from app.main import _guard_production_secrets


def test_register_rejects_a_bad_timezone(client):
    resp = client.post(
        "/auth/register",
        json={
            "email": "newbie@lexi.app",
            "display_name": "Newbie",
            "password": "correcthorse",
            "timezone": "Mars/Olympus_Mons",
        },
    )
    assert resp.status_code == 422, resp.text


def test_register_accepts_a_real_timezone(client):
    resp = client.post(
        "/auth/register",
        json={
            "email": "newbie2@lexi.app",
            "display_name": "Newbie Two",
            "password": "correcthorse",
            "timezone": "Europe/London",
        },
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["user"]["timezone"] == "Europe/London"


def test_login_is_rate_limited_per_ip(client, seeded, monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "rate_limit_enabled", True)
    ratelimit.reset()

    # Wrong-password attempts still count — that's the brute-force surface.
    bad = {"email": "mai@lexi.app", "password": "wrong"}
    for _ in range(settings.login_rate_limit):
        assert client.post("/auth/login", json=bad).status_code == 401

    blocked = client.post("/auth/login", json=bad)
    assert blocked.status_code == 429
    assert "Retry-After" in blocked.headers

    ratelimit.reset()


def test_secret_guard_blocks_dev_secret_in_production():
    prod = Settings(cookie_secure=True, jwt_secret="dev-secret-change-me")
    with pytest.raises(RuntimeError):
        _guard_production_secrets(prod)


def test_secret_guard_blocks_short_secret_in_production():
    prod = Settings(cookie_secure=True, jwt_secret="too-short")
    with pytest.raises(RuntimeError):
        _guard_production_secrets(prod)


def test_secret_guard_allows_strong_secret_in_production():
    prod = Settings(cookie_secure=True, jwt_secret="x" * 48)
    _guard_production_secrets(prod)  # must not raise


def test_secret_guard_is_lenient_in_dev():
    dev = Settings(cookie_secure=False, jwt_secret="dev-secret-change-me")
    _guard_production_secrets(dev)  # must not raise
