# Setup TODO — what *you* still have to turn on

**Status 2026-07-22 — local setup is done.** SMTP is configured (Gmail app
password) and the verification flow was tested end-to-end against Supabase:
register → email delivered → link clicked → `email_verified` flipped in the
database. The Google OAuth Client ID is created and matches across
`backend/.env` and `frontend/.env.local`. Supabase is migrated to head.

**Left to do: §3 only** — the production checklist, for whenever you deploy.
§1 and §2 are kept as a record of what was set up and how to redo it.

Until each block below is done the app still runs fine — it just degrades
quietly:

| Not configured | What actually happens |
|---|---|
| No `SMTP_*` | Verification + reminder emails are **logged, not sent** (`app/email.py`). Nobody receives anything. |
| No `GOOGLE_CLIENT_ID` | The Google button is **hidden** on `/login` and `/register`; `POST /auth/google` returns **503**. |

---

## 1. Google sign-in — create the OAuth Client ID ✅ done

Kept for reference (and for redoing it against a production domain).

1. Google Cloud Console → **APIs & Services → Credentials → Create credentials → OAuth client ID**.
   (If it asks you to configure the consent screen first: External, app name "Lexi",
   your email as support + developer contact. No scopes need adding — the ID-token
   flow only uses the default `openid email profile`.)
2. Application type: **Web application**.
3. **Authorised JavaScript origins** — add `http://localhost:3000` (and your real
   domain later). Leave *redirect URIs* empty; we use the ID-token flow, not the
   redirect flow, so there's no callback URL and **no client secret is needed**.
4. Copy the Client ID (`…apps.googleusercontent.com`) into **both** files — they
   must match, the backend verifies the token's audience against its copy:

   ```
   backend/.env       GOOGLE_CLIENT_ID=<id>.apps.googleusercontent.com
   frontend/.env.local  NEXT_PUBLIC_GOOGLE_CLIENT_ID=<id>.apps.googleusercontent.com
   ```

5. **Restart both servers.** `NEXT_PUBLIC_*` is baked in at build time — a hot
   reload will not pick it up.
6. Check: the Google button appears on `/login`. Sign in with a Google account
   that is *not* a seeded user → a new `student` is created with
   `auth_provider="google"`, `email_verified=true`, `password_hash=NULL`.

## 2. Email — point it at a real SMTP provider ✅ done (Gmail app password)

Uncomment and fill in the `SMTP_*` block in `backend/.env` (see
`backend/.env.example`). Any transactional provider works — Resend, Postmark,
SES, or a Gmail app password for testing:

```
SMTP_HOST=smtp.resend.com
SMTP_PORT=587
SMTP_USER=resend
SMTP_PASSWORD=<api-key>
SMTP_STARTTLS=true
REMINDER_FROM=Lexi <noreply@yourdomain>
APP_BASE_URL=http://localhost:3000   # the verify link is built from this
```

Check: register a new account → you receive the "Confirm your email" message →
the link lands on `/verify-email?token=…` → the banner on Home disappears.

Without SMTP you can still test the flow — the verification URL is printed to
the log by logger `app.email` (`main.py._configure_app_logging` raises the `app`
namespace to INFO, since uvicorn only configures its own loggers).

**Gmail note:** use port **587**, never 465 — `app/email.py` speaks STARTTLS
only. And set `REMINDER_FROM` to an address you actually control; the default
`noreply@lexi.app` is a domain you don't own and will be spam-filtered.

## 3. Before you deploy anywhere public

- `JWT_SECRET` — generate a real one: `python -c "import secrets; print(secrets.token_urlsafe(48))"`.
  The app **refuses to boot** with the dev default once `COOKIE_SECURE=true`.
- `COOKIE_SECURE=true` (requires HTTPS).
- `CORS_ORIGINS` — your real frontend origin, not `localhost:3000`.
- Add the production domain to the Google OAuth **authorised origins**.
- ~~Run `uv run alembic upgrade head` against Supabase~~ — **done 2026-07-22**.
  Supabase is at `d2b3c4e5f6a7`; the three pre-existing accounts were backfilled
  to `email_verified = true`.

## 4. Loose end worth a fresh look

At the very end of the last session, browser testing showed a stray
`POST /auth/logout` and a couple of login clicks that produced no network
request. I traced it: `logout` is only ever called from `SignOutButton`, never
from `RequireAuth`, and login worked earlier in the same session for both
accounts (and is covered by passing tests). It looks like an artifact of a
heavily churned session — repeated logouts bumping `token_version`, rotated
cookies, HMR reloads. **Re-test login once in a clean browser profile** to
confirm; if it reproduces there, it's real and worth chasing.
