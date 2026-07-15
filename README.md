# Lexi

A teacher-curated English vocabulary app for students preparing for entrance exams (grade-10 / university), or anyone who just wants to learn English.

The teacher adds words (AI drafts the definition, IPA, and example) and assigns decks. Students open the app daily, review the cards that are **due** using the **FSRS** spaced-repetition algorithm, take a short quiz, and keep a streak. The teacher's dashboard shows who is studying and who is slipping.

- Product scope: [`docs/SoW_LanguageApp_Phase1.md`](docs/SoW_LanguageApp_Phase1.md)
- Technical design: [`docs/Architecture_LanguageApp.md`](docs/Architecture_LanguageApp.md)
- Conventions for AI/devs: [`CLAUDE.md`](CLAUDE.md)

## Architecture

Two services talking over a JSON API.

| Directory     | Contents                                                                                                             |
| ------------- | -------------------------------------------------------------------------------------------------------------------- |
| `backend/`  | FastAPI, SQLAlchemy 2.0, Alembic, FSRS. Owns all data, auth, and scheduling.                                         |
| `frontend/` | Next.js (App Router, TS), Tailwind v4, TanStack Query. The API client is**generated** from the OpenAPI schema. |
| `docs/`     | Scope of Work + Architecture.                                                                                        |

Authorization is enforced in the **backend only**. The frontend hides admin UI for UX; it is not a security boundary.

## Requirements

Python 3.12+, [uv](https://docs.astral.sh/uv/), Node.js 20+, a [Supabase](https://supabase.com/) account, and Docker (only needed to run the tests).

## Setup

### 1. Database (Supabase)

Create a project, then go to **Project Settings → Database → Connection string → URI** and pick the **session pooler** (port 5432). The transaction pooler (6543) cannot run Alembic migrations, and the direct connection is IPv6-only.

Do not enable Row Level Security on these tables. Auth is handled by FastAPI (JWT), so RLS would block the app's own queries.

### 2. Backend

```bash
cd backend
cp .env.example .env
```

Edit `backend/.env`:

```bash
# The scheme must be postgresql+psycopg:// (not postgresql://).
# URL-encode special characters in the password: @ -> %40, # -> %23
DATABASE_URL=postgresql+psycopg://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres

# Generate with: python -c "import secrets; print(secrets.token_urlsafe(48))"
JWT_SECRET=<a-long-random-string>

# Optional: enables the teacher's AI vocab enrichment (definition/IPA/example).
# If unset, the enrich endpoints return 503 and the teacher fills cards by hand.
ANTHROPIC_API_KEY=<your-anthropic-key>
```

Then:

```bash
uv sync                        # install dependencies
uv run alembic upgrade head    # create the 9 tables
uv run python -m app.seed      # sample accounts + starter deck (idempotent)
```

### 3. Frontend

```bash
cd frontend
cp .env.example .env.local     # defaults to http://localhost:8000
npm install
```

## Running

Two terminals:

```bash
cd backend && uv run uvicorn app.main:app --reload   # http://localhost:8000
```

```bash
cd frontend && npm run dev                           # http://localhost:3000
```

Open http://localhost:3000 and sign in. There is no self-signup; the teacher creates accounts.

| Role    | Email                | Password     |
| ------- | -------------------- | ------------ |
| Teacher | `teacher@lexi.app` | `changeme` |
| Student | `mai@lexi.app`     | `changeme` |

Routes: `/login`, `/student`, `/admin`, `/style-guide` (design system), and `localhost:8000/docs` (Swagger).

## Development

**Regenerate the API client** after any backend schema change. API types are never hand-written.

```bash
# the API must be running on :8000
cd frontend && npm run gen:api
```

**Tests** run against a local Postgres, never Supabase. The suite calls `drop_all()`, so `conftest.py` pins itself to localhost and refuses to start against a remote database.

```bash
cd backend
docker compose up -d    # local Postgres on :5433
uv run pytest
```

**Lint and typecheck:**

```bash
cd backend  && uv run ruff check .
cd frontend && npx tsc --noEmit && npm run lint
```

**New migration:** run `uv run alembic revision --autogenerate -m "..."`, read the generated file in `alembic/versions/`, then `uv run alembic upgrade head`.

## Gotchas

| Problem                                         | Cause                                                                                                            |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `ModuleNotFoundError: psycopg2`               | `DATABASE_URL` is missing `+psycopg`. It must be `postgresql+psycopg://`                                   |
| Alembic times out connecting to Supabase        | Using the direct connection (IPv6) or transaction pooler (6543). Switch to the session pooler                    |
| `type "user_role" already exists`             | Alembic autogenerate does not drop Postgres ENUMs. Any migration that creates one must drop it in`downgrade()` |
| Emails ending in`.local` / `.test` rejected | `email-validator` blocks reserved TLDs. Use a real domain, e.g. `@lexi.app`                                  |
| Frontend type errors after a backend change     | Forgot to run`npm run gen:api`                                                                                 |
| A student does not see a newly added card       | Not a bug.`card_states` are created lazily on the student's next read                                          |

## Phase 1 progress

|    | Milestone                                             | Status |
| -- | ----------------------------------------------------- | ------ |
| M1 | Accounts, login, data model, decks viewable           | Done   |
| M2 | FSRS review loop (`/review/due`, `/review/grade`) | Done   |
| M3 | Teacher add-vocab + AI enrichment                     | Done   |
| M4 | Quizzes + timer (`/quiz`, `/quiz/answer`)         | Done   |
| M5 | Streaks + daily reminders                             | Next   |
| M6 | Teacher dashboard ("who's slipping")                  |        |

**Note:** the student flow (Home, Review, Quiz) is fully wired to the API, and the admin page is wired for M3 (decks, fast-add + AI enrichment, deck assignment). What is still fixture/mock is the **admin dashboard** — per-student progress and the "who's slipping" view land in M6.

Out of scope for Phase 1 (see SoW §5): mock exams, quests, a content library, XP/badges/leaderboards, multi-language, native apps.
