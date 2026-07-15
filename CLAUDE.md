# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

Phase 1, milestone **M4 complete** (accounts, login, data model, decks/cards, the FSRS review loop, admin add-vocab + AI enrichment, and the auto-generated quiz that feeds the scheduler: `/quiz` + `/quiz/answer`). Next up is **M5: streaks + reminders (daily email/push)**. See `docs/SoW_LanguageApp_Phase1.md` §7 for the M1–M6 milestone list.

The student **Home, Review, and Quiz screens are all wired to the API** (`frontend/src/components/apps/StudentApp.tsx`). `AdminApp.tsx` is wired for M3 (decks, fast-add + enrichment, assignment); the **admin dashboard** parts (per-student progress, "who's slipping") are still M6 backlog. Don't mistake any remaining fixtures for working features.

## What this is

Lexi (internally LinguaLoop): a teacher-curated English SRS app for ~12 students, one teacher. Deliberately boring, cheap, single-developer-friendly — do not introduce scale-oriented infra (queues, caching layers, microservices) that the docs explicitly defer to Phase 2.

## Commands

Backend (`cd backend`, uses `uv`):

```bash
uv sync                               # install deps
uv run alembic upgrade head           # apply migrations to whatever DATABASE_URL points at
uv run python -m app.seed             # teacher + student + starter deck (idempotent)
uv run uvicorn app.main:app --reload  # API on :8000, docs at /docs
uv run ruff check .
uv run alembic revision --autogenerate -m "msg"   # then hand-check the diff

docker compose up -d                  # local Postgres on :5433 — ONLY needed for pytest
uv run pytest                         # creates/uses a local `lexi_test` database
uv run pytest tests/test_auth.py::test_student_cannot_reach_admin_routes  # single test
```

## Databases

- **App / dev runtime → Supabase** (hosted Postgres), via `DATABASE_URL` in `backend/.env`. Use the **session pooler** URI (port 5432) with the scheme rewritten to `postgresql+psycopg://`. The transaction pooler (6543) cannot run Alembic, and the direct connection is IPv6-only.
- **Tests → local Docker Postgres**, always. `tests/conftest.py` hardcodes `localhost:5433/lexi_test`, ignores `.env`, and refuses to start against a non-local host — because the suite calls `drop_all()`. Never point the tests at Supabase.
- Supabase is used as **plain managed Postgres only**. Auth is FastAPI's JWT (see below), so do **not** enable Row Level Security on these tables — it would block the app's own queries.

Frontend (`cd frontend`):

```bash
npm run dev          # :3000
npm run gen:api      # regenerate src/lib/api/schema.d.ts — REQUIRES the API running on :8000
npx tsc --noEmit
npm run lint
```

Seeded logins: `teacher@lexi.app` / `mai@lexi.app`, both password `changeme`.

## Gotchas that will bite you

- **Alembic autogenerate does not drop Postgres ENUM types.** A `downgrade` leaves them behind and the next `upgrade` dies with `type "user_role" already exists`. The initial migration's `downgrade()` drops them explicitly — do the same in any migration that adds an enum.
- **Enum columns must use `pg_enum()`** from `app/models/enums.py`. Plain `sa.Enum(SomeEnum)` persists the Python member *name*, which would store `ai_enriched` instead of the documented `ai-enriched`.
- **Email domains**: `email-validator` rejects reserved TLDs (`.local`, `.test`, `.invalid`). Seed/test accounts use `@lexi.app`.
- **`card_states` are materialized lazily** by `srs.service.ensure_card_states()` on the student's first read, not at assignment time — so cards a teacher adds to an already-assigned deck are picked up automatically.
- Regenerate the frontend API client after *any* backend schema change, or the TS types silently drift.

## Architecture

Two deployables communicating over a JSON API — do not blend them into one app or add a BFF layer:

- **`backend/`** — FastAPI (Python), modular monolith. Owns data, auth, SRS scheduling, and background jobs. Domain-separated packages: `auth/`, `vocab/` (incl. `enrichment.py` for AI auto-fill), `srs/` (FSRS wrapper), `quiz/`, `streaks/`, `admin/`, `jobs/` (APScheduler). SQLAlchemy 2.0 + Alembic against PostgreSQL.
- **`frontend/`** — Next.js (App Router, TS) + Tailwind + TanStack Query. Routes split `(student)/review|quiz` from `(admin)/dashboard|decks`. The API client under `lib/api/` is **generated from the backend's OpenAPI schema** — never hand-write API types; regenerate the client whenever a backend schema changes.

Contract-first: FastAPI's auto-generated OpenAPI schema is the source of truth for request/response shapes on both sides.

## Data model invariants

- SRS scheduling state (`card_states`: stability, difficulty, due_at, reps, lapses via `py-fsrs`) is keyed **per student**, not per card — the same teacher-authored deck must schedule independently for each student. Don't collapse this into a card-level field.
- `reviews` is an immutable append-only log (grading history for analytics/dashboard) — never update or delete rows in it, only insert.
- `languages`/`decks.language_id` already model multi-language even though only English ships in Phase 1 — don't add a parallel mechanism for this later.

## Security model

- Authorization is enforced **only** in the FastAPI layer (`role == admin` checks on every admin route, students can only read their own rows). `RequireAuth` in the frontend is cosmetic routing, not a boundary — `backend/tests/test_auth.py` is the thing that actually holds the line, so keep it passing.
- Auth is JWT: a short-lived access token held **in memory only** (never localStorage) plus a rotating refresh token in an httpOnly cookie scoped to `/auth`. `api()` in `lib/api/client.ts` transparently refreshes once and replays on a 401.
- Reading a resource you weren't assigned returns **404, not 403**, so the API can't be used to probe for what exists. Login failures return an identical message for unknown-email and wrong-password (no user enumeration).
- AI enrichment calls (`vocab/enrichment.py`) send only the vocabulary term — never student PII.
- Enrichment results are always shown to the teacher for edit/approval before persisting; nothing from the AI path auto-saves.

## Scope discipline

`docs/SoW_LanguageApp_Phase1.md` §4 is the exhaustive Phase 1 feature list and §5/§8 explicitly defer mock exams, quests, a content library, richer gamification, multi-language content, and native apps to Phase 2. If a request doesn't map to something in §4, flag it as Phase 2 backlog rather than building it.
