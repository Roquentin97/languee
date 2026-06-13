"""Tests for languee_nlp.tracing — configure_tracing and FastAPI span behaviour."""

from __future__ import annotations

import json
import logging
from unittest.mock import MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter
from opentelemetry.trace import SpanContext, TraceFlags

from languee_nlp.middleware import RequestLoggingMiddleware
from languee_nlp.tracing import configure_tracing, sanitize_server_request_span

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

KNOWN_TRACE_ID = 0xAABBCCDDEEFF00112233445566778899
KNOWN_SPAN_ID = 0x0011223344556677
TRACEPARENT = f"00-{KNOWN_TRACE_ID:032x}-{KNOWN_SPAN_ID:016x}-01"


@pytest.fixture()
def nlp_settings(monkeypatch: pytest.MonkeyPatch):
    from languee_nlp.settings import Settings

    monkeypatch.setenv("LANGUEE_NLP_TRACING_ENABLED", "false")
    return Settings()


@pytest.fixture()
def nlp_settings_enabled(monkeypatch: pytest.MonkeyPatch):
    from languee_nlp.settings import Settings

    monkeypatch.setenv("LANGUEE_NLP_TRACING_ENABLED", "true")
    monkeypatch.setenv("LANGUEE_NLP_OTEL_EXPORTER_OTLP_ENDPOINT", "http://alloy:4318")
    return Settings()


@pytest.fixture()
def memory_exporter() -> InMemorySpanExporter:
    return InMemorySpanExporter()


@pytest.fixture()
def instrumented_app(memory_exporter: InMemorySpanExporter):
    """Minimal FastAPI app instrumented with an in-memory OTel provider."""
    from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

    provider = TracerProvider()
    provider.add_span_processor(SimpleSpanProcessor(memory_exporter))

    app = FastAPI()
    app.add_middleware(RequestLoggingMiddleware)

    @app.get("/words")
    def words():
        return {"result": "data"}

    @app.get("/health")
    def health():
        return {"status": "ok"}

    @app.get("/ready")
    def ready():
        return {"status": "ready"}

    FastAPIInstrumentor().instrument_app(
        app,
        excluded_urls="/health,/ready",
        tracer_provider=provider,
        server_request_hook=sanitize_server_request_span,
        http_capture_headers_server_request=[],
        http_capture_headers_server_response=[],
    )

    client = TestClient(app)
    yield client, memory_exporter

    FastAPIInstrumentor().uninstrument_app(app)
    memory_exporter.clear()


# ---------------------------------------------------------------------------
# configure_tracing: tracing disabled
# ---------------------------------------------------------------------------


def test_configure_tracing_disabled_does_not_set_provider(nlp_settings):
    with patch("languee_nlp.tracing.trace") as mock_trace:
        configure_tracing(nlp_settings)

    mock_trace.set_tracer_provider.assert_not_called()


# ---------------------------------------------------------------------------
# configure_tracing: tracing enabled
# ---------------------------------------------------------------------------


def test_configure_tracing_enabled_registers_sdk_tracer_provider(nlp_settings_enabled):
    with (
        patch("languee_nlp.tracing.OTLPSpanExporter") as mock_exp_cls,
        patch("languee_nlp.tracing.trace") as mock_trace,
    ):
        mock_exp_cls.return_value = MagicMock()
        configure_tracing(nlp_settings_enabled)

    mock_trace.set_tracer_provider.assert_called_once()
    provider_arg = mock_trace.set_tracer_provider.call_args[0][0]
    assert isinstance(provider_arg, TracerProvider)


def test_configure_tracing_enabled_sets_correct_otlp_endpoint(nlp_settings_enabled):
    with (
        patch("languee_nlp.tracing.OTLPSpanExporter") as mock_exp_cls,
        patch("languee_nlp.tracing.trace"),
    ):
        mock_exp_cls.return_value = MagicMock()
        configure_tracing(nlp_settings_enabled)

    call_kwargs = mock_exp_cls.call_args[1]
    assert "endpoint" in call_kwargs
    assert call_kwargs["endpoint"] == "http://alloy:4318/v1/traces"


def test_configure_tracing_enabled_resource_has_service_name(nlp_settings_enabled):
    captured: list[TracerProvider] = []

    with (
        patch("languee_nlp.tracing.OTLPSpanExporter") as mock_exp_cls,
        patch("languee_nlp.tracing.trace") as mock_trace,
    ):
        mock_exp_cls.return_value = MagicMock()
        mock_trace.set_tracer_provider.side_effect = captured.append
        configure_tracing(nlp_settings_enabled)

    assert len(captured) == 1
    provider = captured[0]
    attrs = provider.resource.attributes
    assert attrs.get("service.name") == "languee-nlp"
    assert attrs.get("deployment.environment") == "development"


# ---------------------------------------------------------------------------
# FastAPI span: span created per request
# ---------------------------------------------------------------------------


def test_span_created_for_word_request(instrumented_app):
    client, exporter = instrumented_app
    client.get("/words")
    spans = exporter.get_finished_spans()
    assert len(spans) >= 1


# ---------------------------------------------------------------------------
# FastAPI span: incoming traceparent continues the trace
# ---------------------------------------------------------------------------


def test_server_span_parents_to_incoming_traceparent(instrumented_app):
    client, exporter = instrumented_app
    client.get("/words", headers={"traceparent": TRACEPARENT})

    spans = exporter.get_finished_spans()
    assert spans, "no spans recorded"

    server_span = spans[-1]
    parent = server_span.parent
    assert parent is not None, "server span has no parent context"
    assert f"{parent.trace_id:032x}" == f"{KNOWN_TRACE_ID:032x}"
    assert f"{parent.span_id:016x}" == f"{KNOWN_SPAN_ID:016x}"


def test_server_span_trace_id_matches_incoming_traceparent(instrumented_app):
    client, exporter = instrumented_app
    client.get("/words", headers={"traceparent": TRACEPARENT})

    spans = exporter.get_finished_spans()
    assert spans
    span_ctx = spans[-1].context
    assert f"{span_ctx.trace_id:032x}" == f"{KNOWN_TRACE_ID:032x}"


# ---------------------------------------------------------------------------
# FastAPI span: health / ready are not traced
# ---------------------------------------------------------------------------


def test_health_endpoint_produces_no_spans(instrumented_app):
    client, exporter = instrumented_app
    client.get("/health")
    assert exporter.get_finished_spans() == ()


def test_ready_endpoint_produces_no_spans(instrumented_app):
    client, exporter = instrumented_app
    client.get("/ready")
    assert exporter.get_finished_spans() == ()


# ---------------------------------------------------------------------------
# FastAPI span: no Authorization header in span attributes
# ---------------------------------------------------------------------------


def test_authorization_header_not_captured_in_span_attrs(instrumented_app):
    client, exporter = instrumented_app
    client.get("/words", headers={"authorization": "Basic dXNlcjpwYXNz"})

    spans = exporter.get_finished_spans()
    assert spans
    server_span = spans[-1]
    for key, value in (server_span.attributes or {}).items():
        assert "authorization" not in key.lower(), f"auth key leaked: {key}"
        if isinstance(value, str):
            assert "Basic " not in value, f"auth value leaked in attr {key}"


# ---------------------------------------------------------------------------
# sanitize_server_request_span: strips sensitive attrs
# ---------------------------------------------------------------------------


def test_sanitize_strips_authorization_attr():
    mock_span = MagicMock()
    mock_span.is_recording.return_value = True
    mock_span.attributes = {"http.request.header.authorization": "Basic abc123"}

    sanitize_server_request_span(mock_span, {})

    mock_span.set_attribute.assert_called_once_with(
        "http.request.header.authorization", "[REDACTED]"
    )


def test_sanitize_strips_password_attr():
    mock_span = MagicMock()
    mock_span.is_recording.return_value = True
    mock_span.attributes = {"db.password": "secret"}

    sanitize_server_request_span(mock_span, {})

    mock_span.set_attribute.assert_called_once_with("db.password", "[REDACTED]")


def test_sanitize_leaves_safe_attrs_unchanged():
    mock_span = MagicMock()
    mock_span.is_recording.return_value = True
    mock_span.attributes = {"http.method": "GET", "http.route": "/words"}

    sanitize_server_request_span(mock_span, {})

    mock_span.set_attribute.assert_not_called()


def test_sanitize_noop_when_span_not_recording():
    mock_span = MagicMock()
    mock_span.is_recording.return_value = False

    sanitize_server_request_span(mock_span, {})

    mock_span.set_attribute.assert_not_called()


# ---------------------------------------------------------------------------
# JsonFormatter: trace_id / span_id injected from active span
# ---------------------------------------------------------------------------


def test_json_formatter_includes_trace_id_and_span_id_when_span_active():
    from languee_nlp.logging import JsonFormatter

    formatter = JsonFormatter(service="test-svc", environment="test")
    record = logging.LogRecord(
        name="test",
        level=logging.INFO,
        pathname="",
        lineno=0,
        msg="hello",
        args=(),
        exc_info=None,
    )

    mock_span = MagicMock()
    mock_ctx = SpanContext(
        trace_id=KNOWN_TRACE_ID,
        span_id=KNOWN_SPAN_ID,
        is_remote=False,
        trace_flags=TraceFlags(TraceFlags.SAMPLED),
    )
    mock_span.get_span_context.return_value = mock_ctx

    target = "languee_nlp.logging._otel_trace.get_current_span"
    with patch(target, return_value=mock_span):
        output = formatter.format(record)

    parsed = json.loads(output)
    assert parsed["trace_id"] == f"{KNOWN_TRACE_ID:032x}"
    assert parsed["span_id"] == f"{KNOWN_SPAN_ID:016x}"


def test_json_formatter_omits_trace_fields_when_no_active_span():
    from languee_nlp.logging import JsonFormatter

    formatter = JsonFormatter(service="test-svc", environment="test")
    record = logging.LogRecord(
        name="test",
        level=logging.INFO,
        pathname="",
        lineno=0,
        msg="hello",
        args=(),
        exc_info=None,
    )

    mock_span = MagicMock()
    invalid_ctx = SpanContext(
        trace_id=0,
        span_id=0,
        is_remote=False,
        trace_flags=TraceFlags(0),
    )
    mock_span.get_span_context.return_value = invalid_ctx

    target = "languee_nlp.logging._otel_trace.get_current_span"
    with patch(target, return_value=mock_span):
        output = formatter.format(record)

    parsed = json.loads(output)
    assert "trace_id" not in parsed
    assert "span_id" not in parsed


# ---------------------------------------------------------------------------
# Settings: new tracing fields
# ---------------------------------------------------------------------------


def test_tracing_enabled_defaults_to_true(monkeypatch: pytest.MonkeyPatch):
    from languee_nlp.settings import Settings

    monkeypatch.delenv("LANGUEE_NLP_TRACING_ENABLED", raising=False)
    s = Settings()
    assert s.tracing_enabled is True


def test_tracing_enabled_read_from_env(monkeypatch: pytest.MonkeyPatch):
    from languee_nlp.settings import Settings

    monkeypatch.setenv("LANGUEE_NLP_TRACING_ENABLED", "false")
    s = Settings()
    assert s.tracing_enabled is False


def test_otel_endpoint_defaults_to_alloy(monkeypatch: pytest.MonkeyPatch):
    from languee_nlp.settings import Settings

    monkeypatch.delenv("LANGUEE_NLP_OTEL_EXPORTER_OTLP_ENDPOINT", raising=False)
    s = Settings()
    assert s.otel_exporter_otlp_endpoint == "http://alloy:4318"


def test_otel_endpoint_read_from_env(monkeypatch: pytest.MonkeyPatch):
    from languee_nlp.settings import Settings

    monkeypatch.setenv(
        "LANGUEE_NLP_OTEL_EXPORTER_OTLP_ENDPOINT", "http://custom-alloy:4318"
    )
    s = Settings()
    assert s.otel_exporter_otlp_endpoint == "http://custom-alloy:4318"
