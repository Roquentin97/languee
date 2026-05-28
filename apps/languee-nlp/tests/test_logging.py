"""Tests for languee_nlp.logging — JsonFormatter and configure_logging."""

from __future__ import annotations

import json
import logging
import os

import pytest

from languee_nlp.logging import JsonFormatter, _StderrFilter, configure_logging
from languee_nlp.settings import Settings

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_formatter() -> JsonFormatter:
    return JsonFormatter(service="test-svc", environment="test")


def _make_record(
    name: str = "my.logger",
    level: int = logging.INFO,
    message: str = "hello",
    exc_info: tuple | None = None,
) -> logging.LogRecord:
    record = logging.LogRecord(
        name=name,
        level=level,
        pathname="test.py",
        lineno=1,
        msg=message,
        args=(),
        exc_info=exc_info,
    )
    return record


# ---------------------------------------------------------------------------
# JsonFormatter: required fields
# ---------------------------------------------------------------------------


def test_json_formatter_emits_valid_json_for_info_record():
    formatter = _make_formatter()
    record = _make_record()
    output = formatter.format(record)
    parsed = json.loads(output)  # must not raise
    assert isinstance(parsed, dict)


def test_json_formatter_required_fields_present():
    formatter = _make_formatter()
    record = _make_record(name="root", message="test message")
    parsed = json.loads(formatter.format(record))

    assert "timestamp" in parsed
    assert "level" in parsed
    assert "message" in parsed
    assert "service" in parsed
    assert "context" in parsed
    assert "pid" in parsed
    assert "environment" in parsed


def test_json_formatter_field_values():
    formatter = _make_formatter()
    record = _make_record(name="my.module", message="check values")
    parsed = json.loads(formatter.format(record))

    assert parsed["message"] == "check values"
    assert parsed["service"] == "test-svc"
    assert parsed["context"] == "my.module"
    assert parsed["pid"] == os.getpid()
    assert parsed["environment"] == "test"
    assert parsed["level"] == "info"


# ---------------------------------------------------------------------------
# JsonFormatter: level mapping
# ---------------------------------------------------------------------------


def test_json_formatter_warning_maps_to_warn():
    formatter = _make_formatter()
    record = _make_record(level=logging.WARNING)
    parsed = json.loads(formatter.format(record))
    assert parsed["level"] == "warn"


def test_json_formatter_debug_level():
    formatter = _make_formatter()
    record = _make_record(level=logging.DEBUG)
    parsed = json.loads(formatter.format(record))
    assert parsed["level"] == "debug"


def test_json_formatter_error_level():
    formatter = _make_formatter()
    record = _make_record(level=logging.ERROR)
    parsed = json.loads(formatter.format(record))
    assert parsed["level"] == "error"


def test_json_formatter_critical_level():
    formatter = _make_formatter()
    record = _make_record(level=logging.CRITICAL)
    parsed = json.loads(formatter.format(record))
    assert parsed["level"] == "critical"


# ---------------------------------------------------------------------------
# JsonFormatter: single-line output
# ---------------------------------------------------------------------------


def test_json_formatter_output_is_single_line():
    formatter = _make_formatter()
    record = _make_record(message="line one")
    output = formatter.format(record)
    # Must be a single line (no embedded newlines)
    assert "\n" not in output


# ---------------------------------------------------------------------------
# JsonFormatter: exception fields
# ---------------------------------------------------------------------------


def test_json_formatter_exception_includes_error_fields():
    import sys

    formatter = _make_formatter()
    try:
        raise ValueError("something went wrong")
    except ValueError:
        exc_info = sys.exc_info()

    record = _make_record(level=logging.ERROR, exc_info=exc_info)
    parsed = json.loads(formatter.format(record))

    assert "error" in parsed
    assert parsed["error"]["type"] == "ValueError"
    assert parsed["error"]["message"] == "something went wrong"
    assert "stack" in parsed["error"]
    assert len(parsed["error"]["stack"]) > 0


def test_json_formatter_exception_stack_is_string():
    import sys

    formatter = _make_formatter()
    try:
        raise RuntimeError("boom")
    except RuntimeError:
        exc_info = sys.exc_info()

    record = _make_record(level=logging.ERROR, exc_info=exc_info)
    parsed = json.loads(formatter.format(record))
    assert isinstance(parsed["error"]["stack"], str)


def test_json_formatter_no_exception_has_no_error_key():
    formatter = _make_formatter()
    record = _make_record(level=logging.INFO)
    parsed = json.loads(formatter.format(record))
    assert "error" not in parsed


# ---------------------------------------------------------------------------
# JsonFormatter: extra fields
# ---------------------------------------------------------------------------


def test_json_formatter_includes_extra_fields_when_present():
    formatter = _make_formatter()
    record = _make_record()
    record.requestId = "req-abc-123"
    record.duration = 42.5
    parsed = json.loads(formatter.format(record))
    assert parsed["requestId"] == "req-abc-123"
    assert parsed["duration"] == 42.5


def test_json_formatter_omits_extra_fields_when_absent():
    formatter = _make_formatter()
    record = _make_record()
    parsed = json.loads(formatter.format(record))
    for field in ("requestId", "request", "response", "duration", "meta"):
        assert field not in parsed


# ---------------------------------------------------------------------------
# _StderrFilter
# ---------------------------------------------------------------------------


def test_stderr_filter_passes_error_records():
    f = _StderrFilter()
    record = _make_record(level=logging.ERROR)
    assert f.filter(record) is True


def test_stderr_filter_passes_critical_records():
    f = _StderrFilter()
    record = _make_record(level=logging.CRITICAL)
    assert f.filter(record) is True


def test_stderr_filter_blocks_info_records():
    f = _StderrFilter()
    record = _make_record(level=logging.INFO)
    assert f.filter(record) is False


def test_stderr_filter_blocks_warning_records():
    f = _StderrFilter()
    record = _make_record(level=logging.WARNING)
    assert f.filter(record) is False


# ---------------------------------------------------------------------------
# configure_logging: applies settings
# ---------------------------------------------------------------------------


def test_configure_logging_sets_root_level(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("LANGUEE_NLP_LOG_LEVEL", "debug")
    s = Settings()
    configure_logging(s)
    root = logging.getLogger()
    assert root.level == logging.DEBUG


def test_configure_logging_with_info_level(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("LANGUEE_NLP_LOG_LEVEL", "info")
    s = Settings()
    configure_logging(s)
    root = logging.getLogger()
    assert root.level == logging.INFO


def test_configure_logging_disables_uvicorn_access_propagation():
    configure_logging(Settings())
    access_logger = logging.getLogger("uvicorn.access")
    assert access_logger.propagate is False
    assert len(access_logger.handlers) == 0
