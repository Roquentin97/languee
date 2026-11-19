from __future__ import annotations

import json
import logging
import re
import time
import traceback
import uuid

from starlette.requests import Request
from starlette.types import ASGIApp, Message, Receive, Scope, Send

logger = logging.getLogger("languee_nlp.http")

_SKIP_PATHS = {"/health", "/ready"}
_REQUEST_ID_PATTERN = re.compile(r"^[A-Za-z0-9._:-]{1,128}$")
_SAFE_ERROR_CODE = re.compile(r"^[A-Z][A-Z0-9_]{0,95}$")
_MAX_ERROR_BODY_BYTES = 4096


def _request_id(request: Request) -> str:
    candidate = request.headers.get("x-request-id")
    if candidate is not None and _REQUEST_ID_PATTERN.fullmatch(candidate):
        return candidate
    return str(uuid.uuid4())


def _route_matched(scope: Scope) -> bool:
    return scope.get("route") is not None


def _safe_error_code(body: bytes, content_type: str) -> str | None:
    if "json" not in content_type.lower() or len(body) > _MAX_ERROR_BODY_BYTES:
        return None
    try:
        payload = json.loads(body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        return None
    if not isinstance(payload, dict):
        return None

    for key in ("code", "error", "detail", "message"):
        candidate = payload.get(key)
        if isinstance(candidate, list):
            candidate = candidate[0] if candidate else None
        if isinstance(candidate, str) and _SAFE_ERROR_CODE.fullmatch(candidate):
            return candidate
    return None


class RequestLoggingMiddleware:
    """Log safe request metadata while passing response bytes through unchanged."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request = Request(scope, receive=receive)
        request_id = _request_id(request)
        scope["languee.request_id"] = request_id
        skip = request.url.path in _SKIP_PATHS
        started_at = time.perf_counter()
        status: int | None = None
        content_type = ""
        capture_error_body = False
        body_preview = bytearray()
        body_exceeded_limit = False

        async def send_with_request_id(message: Message) -> None:
            nonlocal status, content_type, capture_error_body, body_exceeded_limit
            if message["type"] == "http.response.start":
                status = int(message["status"])
                headers = [
                    (key, value)
                    for key, value in message.get("headers", [])
                    if key.lower() != b"x-request-id"
                ]
                headers.append((b"x-request-id", request_id.encode("ascii")))
                content_type = next(
                    (
                        value.decode("latin-1")
                        for key, value in headers
                        if key.lower() == b"content-type"
                    ),
                    "",
                )
                capture_error_body = status >= 400 and "json" in content_type.lower()
                message = {**message, "headers": headers}

            if message["type"] == "http.response.body" and capture_error_body:
                chunk = message.get("body", b"")
                remaining = _MAX_ERROR_BODY_BYTES - len(body_preview)
                if len(chunk) > remaining:
                    body_exceeded_limit = True
                if remaining > 0:
                    body_preview.extend(chunk[:remaining])

            await send(message)

            if (
                message["type"] == "http.response.body"
                and not message.get("more_body", False)
                and not skip
            ):
                self._log_response(
                    scope,
                    status,
                    request_id,
                    started_at,
                    _route_matched(scope),
                    None
                    if body_exceeded_limit
                    else _safe_error_code(bytes(body_preview), content_type),
                )

        try:
            await self.app(scope, receive, send_with_request_id)
        except Exception as exc:
            if not skip:
                logger.error(
                    "Request failed before a response was created",
                    extra={
                        "requestId": request_id,
                        "request": {
                            "method": request.method,
                            "path": request.url.path,
                        },
                        "failure": {"stage": "server"},
                        "error": {
                            "type": type(exc).__name__,
                            "stack": traceback.format_tb(exc.__traceback__)[-12:],
                        },
                    },
                )
            raise

    @staticmethod
    def _log_response(
        scope: Scope,
        status: int | None,
        request_id: str,
        started_at: float,
        route_matched: bool,
        error_code: str | None,
    ) -> None:
        if status is None:
            return
        request = Request(scope)
        duration = round((time.perf_counter() - started_at) * 1000, 2)
        fields = {
            "requestId": request_id,
            "request": {"method": request.method, "path": request.url.path},
            "response": {
                "statusCode": status,
                **({"errorCode": error_code} if error_code else {}),
            },
            "duration": duration,
            "http": {
                "method": request.method,
                "path": request.url.path,
                "status_code": status,
                "duration_ms": duration,
            },
            **(
                {
                    "failure": {
                        "stage": "route" if not route_matched else "application",
                        "classification": (
                            "route_not_found"
                            if status == 404 and not route_matched
                            else "http_error"
                        ),
                    },
                    **({"errorCode": error_code} if error_code else {}),
                }
                if status >= 400
                else {}
            ),
        }
        log = logger.warning if status >= 400 else logger.info
        log("Request completed" if status < 400 else "Request failed", extra=fields)
