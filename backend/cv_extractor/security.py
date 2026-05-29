from __future__ import annotations

import json
import os
import threading
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from hashlib import sha256
from typing import Any, Callable

from fastapi import Request
from fastapi.responses import JSONResponse


DEFAULT_SECURITY_HEADERS = {
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-Permitted-Cross-Domain-Policies": "none",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Cross-Origin-Opener-Policy": "same-origin",
}


def apply_security_headers(response: JSONResponse, *, cache_control: str = "no-store") -> JSONResponse:
    for key, value in DEFAULT_SECURITY_HEADERS.items():
        response.headers.setdefault(key, value)
    response.headers.setdefault("Cache-Control", cache_control)
    return response


def get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    first_forwarded = next((part.strip() for part in forwarded.split(",") if part.strip()), "")
    return (
        request.headers.get("cf-connecting-ip")
        or request.headers.get("x-real-ip")
        or first_forwarded
        or "unknown"
    )


def make_rate_limit_key(request: Request, subject: str | None = None) -> str:
    return f"{get_client_ip(request)}:{subject or 'anonymous'}"


def _now() -> int:
    return int(time.time())


def _upstash_config() -> tuple[str, str] | None:
    url = os.getenv("UPSTASH_REDIS_REST_URL", "").strip().rstrip("/")
    token = os.getenv("UPSTASH_REDIS_REST_TOKEN", "").strip()
    if not url or not token:
        return None
    return url, token


def _upstash_post(path: str, payload: Any) -> Any | None:
    config = _upstash_config()
    if not config:
        return None

    url, token = config
    request = urllib.request.Request(
        f"{url}{path}",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=5) as response:
            return json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, ValueError):
        return None


@dataclass
class RateLimitState:
    allowed: bool
    limit: int
    remaining: int
    retry_after: int

    @property
    def headers(self) -> dict[str, str]:
        return {
            "Retry-After": str(self.retry_after),
            "X-RateLimit-Limit": str(self.limit),
            "X-RateLimit-Remaining": str(self.remaining),
            "X-RateLimit-Reset": str(_now() + self.retry_after),
        }


class RateLimiter:
    def __init__(self) -> None:
        self._store: dict[str, tuple[int, int]] = {}
        self._lock = threading.Lock()

    def check(self, namespace: str, subject_key: str, max_requests: int, window_seconds: int) -> RateLimitState:
        hashed_key = sha256(subject_key.encode("utf-8")).hexdigest()
        storage_key = f"ratelimit:{namespace}:{hashed_key}"
        remote = _upstash_post("/pipeline", [
            ["INCR", storage_key],
            ["EXPIRE", storage_key, window_seconds],
            ["TTL", storage_key],
        ])

        count = int(remote[0]["result"]) if isinstance(remote, list) and len(remote) > 2 and str(remote[0].get("result", "")).isdigit() else 0
        ttl = int(remote[2]["result"]) if isinstance(remote, list) and len(remote) > 2 and str(remote[2].get("result", "")).lstrip("-").isdigit() else 0

        if count <= 0:
            now = _now()
            with self._lock:
                current_count, expires_at = self._store.get(storage_key, (0, now + window_seconds))
                if expires_at <= now:
                    current_count = 0
                    expires_at = now + window_seconds
                count = current_count + 1
                ttl = max(1, expires_at - now)
                self._store[storage_key] = (count, expires_at)
        else:
            ttl = ttl if ttl > 0 else window_seconds

        remaining = max(0, max_requests - count)
        return RateLimitState(
            allowed=count <= max_requests,
            limit=max_requests,
            remaining=remaining,
            retry_after=ttl,
        )


class CacheStore:
    def __init__(self) -> None:
        self._store: dict[str, tuple[str, int]] = {}
        self._lock = threading.Lock()

    def remember_json(self, namespace: str, payload: Any, ttl_seconds: int, loader: Callable[[], Any]) -> Any:
        cache_key = f"cache:{namespace}:{sha256(json.dumps(payload, sort_keys=True).encode('utf-8')).hexdigest()}"
        now = _now()

        with self._lock:
            cached = self._store.get(cache_key)
            if cached and cached[1] > now:
                return json.loads(cached[0])

        remote = _upstash_post("/get", [cache_key])
        remote_result = remote.get("result") if isinstance(remote, dict) else None
        if isinstance(remote_result, str):
            try:
                parsed = json.loads(remote_result)
                with self._lock:
                    self._store[cache_key] = (remote_result, now + ttl_seconds)
                return parsed
            except ValueError:
                pass

        value = loader()
        encoded = json.dumps(value, sort_keys=True, default=str)
        with self._lock:
            self._store[cache_key] = (encoded, now + ttl_seconds)
        _upstash_post("/set", [cache_key, encoded, {"ex": ttl_seconds}])
        return value


def build_rate_limit_response(state: RateLimitState) -> JSONResponse:
    response = JSONResponse(
        status_code=429,
        content={
            "error": {
                "code": "RATE_LIMITED",
                "message": "Too many requests. Please slow down and try again shortly.",
                "retryable": True,
            }
        },
    )
    for key, value in state.headers.items():
        response.headers[key] = value
    return apply_security_headers(response)
