from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.admin.router import router as admin_router
from app.auth.router import router as auth_router
from app.config import get_settings
from app.jobs.scheduler import shutdown_scheduler, start_scheduler
from app.quiz.router import router as quiz_router
from app.srs.router import router as review_router
from app.streaks.router import router as streaks_router
from app.vocab.router import router as vocab_router

settings = get_settings()

_DEFAULT_JWT_SECRET = "dev-secret-change-me"


def _guard_production_secrets(cfg) -> None:
    """Refuse to boot a production process with a forgeable JWT secret.

    `cookie_secure=True` is the production signal (secure cookies need HTTPS).
    In that mode the built-in dev secret — or any too-short secret — would let
    anyone mint valid tokens, so fail loudly at startup instead of silently
    shipping a hole."""
    if not cfg.cookie_secure:
        return
    if cfg.jwt_secret == _DEFAULT_JWT_SECRET:
        raise RuntimeError(
            "JWT_SECRET is still the built-in dev default but COOKIE_SECURE=true "
            "signals production. Set a strong, random JWT_SECRET before deploying."
        )
    if len(cfg.jwt_secret) < 32:
        raise RuntimeError(
            "JWT_SECRET is too short for production (need at least 32 chars). "
            "Generate one with e.g. `python -c 'import secrets; print(secrets.token_urlsafe(48))'`."
        )


@asynccontextmanager
async def lifespan(app: FastAPI):
    _guard_production_secrets(settings)
    # The daily-reminder scheduler lives with the app process (SoW §4 M5).
    start_scheduler()
    try:
        yield
    finally:
        shutdown_scheduler()


app = FastAPI(
    title="Lexi API",
    version="0.1.0",
    description="Teacher-curated English vocabulary app. Phase 1.",
    lifespan=lifespan,
)

# The frontend origin only — never "*".
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(vocab_router)
app.include_router(review_router)
app.include_router(quiz_router)
app.include_router(streaks_router)
app.include_router(admin_router)


@app.get("/health", tags=["meta"])
def health() -> dict[str, str]:
    return {"status": "ok"}
