"""In-memory, per-IP rate limiting for the auth endpoints (M7 hardening).

Deliberately tiny and in-process: one small app, ~12 users. No Redis, no
`slowapi` — that's the Phase-2 scale infra the SoW defers. A sliding-window
counter keyed by client IP + bucket name slows down credential stuffing and
signup abuse on a single-process deployment.

Caveats, stated plainly so nobody mistakes this for more than it is: state lives
in this module, so it resets on restart and is NOT shared across multiple worker
processes. For the current single-process deployment that's adequate; a
multi-worker or multi-host setup would need a shared store instead.
"""

from collections import defaultdict, deque
from time import monotonic

from fastapi import HTTPException, Request, status

from app.config import get_settings

# bucket:ip -> timestamps (monotonic seconds) of recent hits, oldest first.
_hits: dict[str, deque[float]] = defaultdict(deque)


def _client_ip(request: Request) -> str:
    """Best-effort client IP. Behind a proxy the real client is the first
    X-Forwarded-For hop; otherwise fall back to the socket peer."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _check(bucket: str, ip: str, limit: int, window_s: float) -> None:
    now = monotonic()
    hits = _hits[f"{bucket}:{ip}"]
    cutoff = now - window_s
    while hits and hits[0] < cutoff:
        hits.popleft()
    if len(hits) >= limit:
        retry_after = int(hits[0] + window_s - now) + 1
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many attempts. Please wait a moment and try again.",
            headers={"Retry-After": str(retry_after)},
        )
    hits.append(now)


def reset() -> None:
    """Clear every bucket. Used by the test suite between cases."""
    _hits.clear()


def rate_limit(bucket: str, limit: int, window_s: float):
    """A FastAPI dependency enforcing `limit` requests per `window_s` per IP.

    No-op when `rate_limit_enabled` is off (how the test suite keeps unrelated
    login calls from tripping the limiter)."""

    def dependency(request: Request) -> None:
        if not get_settings().rate_limit_enabled:
            return
        _check(bucket, _client_ip(request), limit, window_s)

    return dependency
