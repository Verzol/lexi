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

    # AI enrichment (vocab/enrichment.py). The key stays server-side; enrichment
    # sends only the vocabulary term, never student data. Model is configurable so
    # it can be swapped (Opus/Sonnet) without a code change. If the key is unset,
    # the enrichment endpoints return 503 rather than crashing the app.
    anthropic_api_key: str | None = None
    enrichment_model: str = "claude-haiku-4-5"

    # Seeded on first migration so the teacher can log in.
    seed_admin_email: str = "teacher@lexi.app"
    seed_admin_password: str = "changeme"


@lru_cache
def get_settings() -> Settings:
    return Settings()
