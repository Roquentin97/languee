from __future__ import annotations

import datetime
import json
import logging
import os
import sys
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

_EXTRA_FIELDS = ("requestId", "request", "response", "duration", "meta")


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
            exc_type, exc_value, _ = record.exc_info
            payload["error"] = {
                "type": exc_type.__name__ if exc_type is not None else "UnknownError",
                "message": str(exc_value),
                "stack": self.formatException(record.exc_info),
            }

        for field in _EXTRA_FIELDS:
            value = record.__dict__.get(field)
            if value is not None:
                payload[field] = value

        return json.dumps(payload, ensure_ascii=False)


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
