from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Postgres. Locally this is Docker; in production a Supabase connection string.
    database_url: str = "postgresql+psycopg://lexi:lexi@localhost:5433/lexi"

    # Auth. access tokens are short-lived and held in memory by the frontend;
    # the refresh token rides in an httpOnly cookie.
    jwt_secret: str = "dev-secret-change-me"
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 15
    refresh_token_days: int = 30
    refresh_cookie_name: str = "lexi_refresh"
    # False for local http dev; must be True in production (HTTPS).
    cookie_secure: bool = False

    # CORS — the frontend origin(s) only, never "*".
    cors_origins: list[str] = ["http://localhost:3000"]

    # Auth rate limiting (app/ratelimit.py). In-memory, per-IP. Disabled in the
    # test suite so unrelated login calls don't trip the limiter. Login is the
    # brute-force surface; register is the signup-abuse surface, so it's tighter.
    rate_limit_enabled: bool = True
    login_rate_limit: int = 10  # attempts...
    login_rate_window_s: int = 60  # ...per this many seconds, per IP
    register_rate_limit: int = 5
    register_rate_window_s: int = 3600

    # AI enrichment (vocab/enrichment.py). The key stays server-side; enrichment
    # sends only the vocabulary term, never student data. Model is configurable so
    # it can be swapped (Opus/Sonnet) without a code change. If the key is unset,
    # the enrichment endpoints return 503 rather than crashing the app.
    anthropic_api_key: str | None = None
    enrichment_model: str = "claude-haiku-4-5"

    # Email verification (M7). A signed, short-lived token is emailed on signup;
    # the link points at the frontend `/verify-email` page, which posts it back.
    email_verify_ttl_hours: int = 48

    # Google sign-in (M7). The OAuth *Client ID* only — no client secret is needed
    # for the Google Identity Services ID-token flow. Unset ⇒ /auth/google returns
    # 503 and the frontend hides the button. This same ID must be exposed to the
    # frontend as NEXT_PUBLIC_GOOGLE_CLIENT_ID.
    google_client_id: str | None = None

    # Seeded on first migration so the teacher can log in.
    seed_admin_email: str = "teacher@lexi.app"
    seed_admin_password: str = "changeme"

    # Daily reminder email (M5). A background job nudges any student who hasn't
    # studied yet, once a day, at `reminder_hour` in the student's own timezone.
    # When `smtp_host` is unset the email is *logged, not sent* — so dev runs and
    # the test suite never touch the network. Web push is a Phase-2 enhancement.
    reminder_enabled: bool = True
    reminder_hour: int = 19  # local hour (0–23) to send the nudge
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_user: str | None = None
    smtp_password: str | None = None
    smtp_starttls: bool = True
    reminder_from: str = "Lexi <noreply@lexi.app>"
    # Link the email points the student at (their review screen).
    app_base_url: str = "http://localhost:3000"


@lru_cache
def get_settings() -> Settings:
    return Settings()
