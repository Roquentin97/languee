from __future__ import annotations

import datetime
import json
import logging
import os
import re
import sys
import traceback
from typing import TYPE_CHECKING

from opentelemetry import trace as _otel_trace

if TYPE_CHECKING:
    from languee_nlp.settings import Settings

_LEVEL_MAP: dict[int, str] = {
    logging.DEBUG: "debug",
    logging.INFO: "info",
    logging.WARNING: "warn",
    logging.ERROR: "error",
    logging.CRITICAL: "critical",
}

_EXTRA_FIELDS = (
    "requestId",
    "request",
    "response",
    "duration",
    "meta",
    "method",
    "event",
    "data",
    "http",
    "failure",
    "error",
)
_SENSITIVE_KEY_PARTS = (
    "authorization",
    "password",
    "cookie",
    "secret",
    "api_key",
    "apikey",
    "access_token",
    "refresh_token",
    "jwt",
)
_PRIVATE_TEXT_KEYS = frozenset(
    {
        "text",
        "word",
        "input_text",
        "raw_text",
        "expression",
        "canonical",
        "lemma",
        "matched_text",
        "token_text",
    }
)
_BEARER_PATTERN = re.compile(r"\b(Bearer|Basic)\s+[A-Za-z0-9._~+/-]+=*", re.IGNORECASE)
_SECRET_PATTERN = re.compile(
    r"\b(authorization|cookie|set-cookie|password|token|secret|api[_-]?key)\s*([=:])\s*(\"[^\"]*\"|'[^']*'|[^\s,;&]+)",
    re.IGNORECASE,
)
_MAX_STRING_LENGTH = 4096
_MAX_ITEMS = 64
_MAX_DEPTH = 8
_TRUNCATED = "...[TRUNCATED]"


class JsonFormatter(logging.Formatter):
    def __init__(self, service: str, environment: str) -> None:
        super().__init__()
        self._service = service
        self._environment = environment

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, object] = {
            "timestamp": datetime.datetime.now(datetime.UTC).isoformat(),
            "level": _LEVEL_MAP.get(record.levelno, record.levelname.lower()),
            "message": record.getMessage(),
            "service": self._service,
            "service_version": os.getenv("APP_VERSION", "0.0.0"),
            "vcs_revision": os.getenv("GIT_SHA", "unknown"),
            "build_id": os.getenv("BUILD_ID", "unknown"),
            "context": record.name,
            "pid": os.getpid(),
            "environment": self._environment,
        }

        span = _otel_trace.get_current_span()
        ctx = span.get_span_context()
        if ctx.is_valid:
            payload["trace_id"] = f"{ctx.trace_id:032x}"
            payload["span_id"] = f"{ctx.span_id:016x}"

        if record.exc_info:
            exc_type, exc_value, exc_tb = record.exc_info
            payload["error"] = {
                "type": exc_type.__name__ if exc_type is not None else "UnknownError",
                "stack": traceback.format_tb(exc_tb)[-12:] if exc_tb else [],
            }

        for field in _EXTRA_FIELDS:
            value = record.__dict__.get(field)
            if value is not None:
                payload[field] = value

        safe_payload = _sanitize_value(payload, "", False, 0)
        return json.dumps(safe_payload, ensure_ascii=False)


def _sanitize_value(value: object, key: str, private_data: bool, depth: int) -> object:
    normalized_key = key.lower().replace("-", "_")
    if any(part in normalized_key for part in _SENSITIVE_KEY_PARTS):
        return "[REDACTED]"
    if private_data and normalized_key in _PRIVATE_TEXT_KEYS:
        return "[OMITTED]"
    if isinstance(value, str):
        return _sanitize_string(value, normalized_key)
    if value is None or isinstance(value, int | float | bool):
        return value
    if depth >= _MAX_DEPTH:
        return _TRUNCATED
    child_private = private_data or normalized_key == "data"
    if isinstance(value, dict):
        entries = list(value.items())[:_MAX_ITEMS]
        sanitized = {
            str(child_key): _sanitize_value(
                child, str(child_key), child_private, depth + 1
            )
            for child_key, child in entries
        }
        if len(value) > _MAX_ITEMS:
            sanitized["log_fields_truncated"] = True
        return sanitized
    if isinstance(value, list | tuple):
        sanitized_items = [
            _sanitize_value(child, key, child_private, depth + 1)
            for child in value[:_MAX_ITEMS]
        ]
        if len(value) > _MAX_ITEMS:
            sanitized_items.append(_TRUNCATED)
        return sanitized_items
    return _sanitize_string(str(value), normalized_key)


def _sanitize_string(value: str, key: str) -> str:
    safe = _BEARER_PATTERN.sub(r"\1 [REDACTED]", value)
    safe = _SECRET_PATTERN.sub(r"\1\2[REDACTED]", safe)
    if key.endswith("url") or key.endswith("uri"):
        safe = re.split(r"[?#]", safe, maxsplit=1)[0]
    if len(safe) > _MAX_STRING_LENGTH:
        return f"{safe[: _MAX_STRING_LENGTH - len(_TRUNCATED)]}{_TRUNCATED}"
    return safe


class _StderrFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        return record.levelno >= logging.ERROR


def configure_logging(settings: Settings) -> None:
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.getLevelName(settings.log_level.upper()))

    for handler in root_logger.handlers[:]:
        root_logger.removeHandler(handler)

    formatter = JsonFormatter(
        service=settings.service_name,
        environment=settings.environment,
    )

    stdout_handler = logging.StreamHandler(sys.stdout)
    stdout_handler.setLevel(logging.DEBUG)
    stdout_handler.setFormatter(formatter)
    root_logger.addHandler(stdout_handler)

    stderr_handler = logging.StreamHandler(sys.stderr)
    stderr_handler.setLevel(logging.DEBUG)
    stderr_handler.setFormatter(formatter)
    stderr_handler.addFilter(_StderrFilter())
    root_logger.addHandler(stderr_handler)

    uvicorn_error_logger = logging.getLogger("uvicorn.error")
    uvicorn_error_logger.propagate = True
    for handler in uvicorn_error_logger.handlers[:]:
        uvicorn_error_logger.removeHandler(handler)

    uvicorn_access_logger = logging.getLogger("uvicorn.access")
    uvicorn_access_logger.propagate = False
    for handler in uvicorn_access_logger.handlers[:]:
        uvicorn_access_logger.removeHandler(handler)

    uvicorn_logger = logging.getLogger("uvicorn")
    uvicorn_logger.propagate = True
