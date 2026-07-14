from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.admin.router import router as admin_router
from app.auth.router import router as auth_router
from app.config import get_settings
from app.streaks.router import router as streaks_router
from app.vocab.router import router as vocab_router

settings = get_settings()

app = FastAPI(
    title="Lexi API",
    version="0.1.0",
    description="Teacher-curated English vocabulary app. Phase 1.",
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
app.include_router(streaks_router)
app.include_router(admin_router)


@app.get("/health", tags=["meta"])
def health() -> dict[str, str]:
    return {"status": "ok"}
