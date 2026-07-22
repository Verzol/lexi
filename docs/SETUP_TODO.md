# Setup TODO — what *you* still have to turn on

M7 shipped the code for email verification and Google sign-in, but both need
credentials I can't create for you. Until you do the two blocks below, the app
still runs fine — it just degrades quietly:

| Not configured | What actually happens |
|---|---|
| No `SMTP_*` | Verification + reminder emails are **logged, not sent** (`app/email.py`). Nobody receives anything. |
| No `GOOGLE_CLIENT_ID` | The Google button is **hidden** on `/login` and `/register`; `POST /auth/google` returns **503**. |

---

## 1. Google sign-in — create the OAuth Client ID

You have to do this one yourself; it needs your Google account.

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

## 2. Email — point it at a real SMTP provider

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

Without SMTP you can still test the flow — the verification URL is written to
the log by logger `app.email` at INFO. Note uvicorn leaves the root logger at
WARNING, so run with `--log-level info` or you won't see it.

## 3. Before you deploy anywhere public

- `JWT_SECRET` — generate a real one: `python -c "import secrets; print(secrets.token_urlsafe(48))"`.
  The app **refuses to boot** with the dev default once `COOKIE_SECURE=true`.
- `COOKIE_SECURE=true` (requires HTTPS).
- `CORS_ORIGINS` — your real frontend origin, not `localhost:3000`.
- Add the production domain to the Google OAuth **authorised origins**.
- Run `uv run alembic upgrade head` against the Supabase database — migrations
  `c1a2b3d4e5f6` and `d2b3c4e5f6a7` have only been applied locally so far.

## 4. Loose end worth a fresh look

At the very end of the last session, browser testing showed a stray
`POST /auth/logout` and a couple of login clicks that produced no network
request. I traced it: `logout` is only ever called from `SignOutButton`, never
from `RequireAuth`, and login worked earlier in the same session for both
accounts (and is covered by passing tests). It looks like an artifact of a
heavily churned session — repeated logouts bumping `token_version`, rotated
cookies, HMR reloads. **Re-test login once in a clean browser profile** to
confirm; if it reproduces there, it's real and worth chasing.
