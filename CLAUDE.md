# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

Phase 1 is **feature-complete (M1–M6 done)**: accounts + login, data model, decks/cards, the FSRS review loop, admin add-vocab + AI enrichment, the auto-generated quiz (`/quiz` + `/quiz/answer`), streaks + daily email reminders (web push stays deferred to Phase 2 per SoW §5/§8), and the M6 admin dashboard (see below). The streak advances once per local day on any graded card — review or quiz both funnel through `srs.grade_card`, which calls `streaks.service.record_activity`; freezes bridge a single missed day. A background APScheduler job (`app/jobs/scheduler.py`) ticks hourly and emails a nudge to any student at their local `REMINDER_HOUR` who hasn't studied that day (`app/streaks/reminders.py`); with no SMTP configured the email is *logged, not sent* (`app/email.py`). The student Home already renders the real streak (`StudentApp.tsx` reads `/me/streak`), so there's no remaining M5 frontend work.

**Scope change (out-of-band, not a numbered milestone): the app is now self-serve.** Students **self-register** (`/register` page → `POST /auth/register`) and can **author their own personal vocab** (the "My Vocabulary" screen in `StudentApp.tsx` → student `/decks` CRUD). Being added to a class stays teacher-driven (deck assignment). This revises SoW §2/§5 (see those sections and the Security model below). Still owed on the signup path: email verification + rate limiting.

**M6 is complete** — the admin dashboard is live. `GET /admin/dashboard` (`app/admin/service.py`) returns per-student progress (streak, last-active, due, reviewed-this-week, all-time accuracy), a `slipping` flag (no graded review in `SLIP_DAYS`=5, measured from signup if never active), a class summary, and per-**class**-deck progress (`mastered_pct` = share of student×card states graduated to `review`; personal student decks are excluded). All of it is derived from the immutable `reviews` log + `streaks` + `card_states` — no new tables. **All Phase 1 milestones (M1–M6) are now done.** See `docs/SoW_LanguageApp_Phase1.md` §7.

The student **Home, Review, and Quiz screens are all wired to the API** (`frontend/src/components/apps/StudentApp.tsx`). **`AdminApp.tsx` is fully wired**: decks, fast-add + enrichment, assignment, add-student, and the dashboard (`admin.dashboard()` → the real class table + deck-progress panel; the old `STUDENTS` fixture is gone). No student-facing fixtures remain.

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
- **Personal decks reuse the assignment machinery, not a new table.** A student-authored deck has `owner_id = <that student>` and is **self-assigned** (`Assignment(student_id=owner, active=True)`) at creation, so it flows through `ensure_card_states`/`due_queue`/quiz with zero special-casing. "In a class" just means having ≥1 deck owned by the teacher assigned to you; `AssignedDeckOut.owned` (owner==viewer) is what the UI uses to split "My decks" from "Class decks." There is deliberately **no** Group/Class entity.

## Security model

- Authorization is enforced **only** in the FastAPI layer (`role == admin` checks on every admin route; students can read their own rows and **write only decks/cards they own**). `RequireAuth` in the frontend is cosmetic routing, not a boundary — `backend/tests/test_auth.py` and `test_self_serve.py` are what actually hold the line, so keep them passing.
- **Self-signup is on** (`POST /auth/register`, public, always creates a `student`, auto-logs-in). It has **no email verification and no rate limiting yet** — both are owed before any real public launch (flagged in the endpoint and SoW §5). The teacher account is still provisioned out-of-band.
- Students author **personal decks/cards** via the student `/decks` routes (`vocab/router.py`), scoped by `Deck.owner_id`; a deck you don't own returns **404, not 403** (same probing defense as everywhere). Card `source` is force-set to `manual` there — **AI enrichment stays admin-only** (`/admin/enrich`) to cap cost/abuse.
- Auth is JWT: a short-lived access token held **in memory only** (never localStorage) plus a rotating refresh token in an httpOnly cookie scoped to `/auth`. `api()` in `lib/api/client.ts` transparently refreshes once and replays on a 401.
- Reading a resource you weren't assigned returns **404, not 403**, so the API can't be used to probe for what exists. Login failures return an identical message for unknown-email and wrong-password (no user enumeration).
- AI enrichment calls (`vocab/enrichment.py`) send only the vocabulary term — never student PII.
- Enrichment results are always shown to the teacher for edit/approval before persisting; nothing from the AI path auto-saves.

## Scope discipline

`docs/SoW_LanguageApp_Phase1.md` §4 is the exhaustive Phase 1 feature list and §5/§8 explicitly defer mock exams, quests, a content library, richer gamification, multi-language content, and native apps to Phase 2. If a request doesn't map to something in §4, flag it as Phase 2 backlog rather than building it.
