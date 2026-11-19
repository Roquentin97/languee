"""Tests for RequestLoggingMiddleware."""

from __future__ import annotations

import logging

import pytest
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient
from starlette.types import ASGIApp, Receive, Scope, Send

from languee_nlp.middleware import RequestLoggingMiddleware

# ---------------------------------------------------------------------------
# Minimal test app — avoids importing the real app (which loads spaCy)
# ---------------------------------------------------------------------------


def _make_app() -> FastAPI:
    """Build a lightweight FastAPI app with RequestLoggingMiddleware."""
    app = FastAPI()
    app.add_middleware(RequestLoggingMiddleware)

    @app.get("/health")
    def health():
        return {"status": "ok"}

    @app.get("/ready")
    def ready():
        return {"status": "ready"}

    @app.get("/words")
    def words():
        return {"result": "data"}

    @app.get("/application-error")
    def application_error():
        return JSONResponse(
            status_code=422,
            content={"detail": "INPUT_INVALID"},
        )

    return app


class NoClientAddress:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        scope["client"] = None
        await self.app(scope, receive, send)


@pytest.fixture()
def client() -> TestClient:
    return TestClient(_make_app())


# ---------------------------------------------------------------------------
# X-Request-ID header behaviour
# ---------------------------------------------------------------------------


def test_health_response_has_x_request_id(client: TestClient):
    response = client.get("/health")
    assert response.status_code == 200
    assert "x-request-id" in response.headers


def test_health_response_propagates_incoming_request_id(client: TestClient):
    response = client.get("/health", headers={"x-request-id": "test-id-123"})
    assert response.headers["x-request-id"] == "test-id-123"


def test_non_health_response_has_x_request_id(client: TestClient):
    response = client.get("/words")
    assert "x-request-id" in response.headers


def test_incoming_request_id_propagated_for_non_health(client: TestClient):
    response = client.get("/words", headers={"x-request-id": "my-trace-id"})
    assert response.headers["x-request-id"] == "my-trace-id"


def test_malformed_incoming_request_id_is_replaced(client: TestClient):
    response = client.get("/words", headers={"x-request-id": "bad request id"})
    assert response.status_code == 200
    assert response.headers["x-request-id"] != "bad request id"
    assert len(response.headers["x-request-id"]) == 36


# ---------------------------------------------------------------------------
# /health is NOT logged
# ---------------------------------------------------------------------------


def test_health_endpoint_is_not_logged(
    client: TestClient, caplog: pytest.LogCaptureFixture
):
    with caplog.at_level(logging.INFO, logger="languee_nlp.http"):
        client.get("/health")

    completion_records = [
        r
        for r in caplog.records
        if r.name == "languee_nlp.http" and "Request completed" in r.getMessage()
    ]
    assert len(completion_records) == 0


# ---------------------------------------------------------------------------
# /ready is NOT logged
# ---------------------------------------------------------------------------


def test_ready_endpoint_is_not_logged(
    client: TestClient, caplog: pytest.LogCaptureFixture
):
    with caplog.at_level(logging.INFO, logger="languee_nlp.http"):
        client.get("/ready")

    completion_records = [
        r
        for r in caplog.records
        if r.name == "languee_nlp.http" and "Request completed" in r.getMessage()
    ]
    assert len(completion_records) == 0


# ---------------------------------------------------------------------------
# Non-health endpoint IS logged with correct fields
# ---------------------------------------------------------------------------


def test_non_health_endpoint_produces_request_log(
    client: TestClient, caplog: pytest.LogCaptureFixture
):
    with caplog.at_level(logging.INFO, logger="languee_nlp.http"):
        response = client.get("/words")

    assert response.status_code == 200
    completion_records = [
        r
        for r in caplog.records
        if r.name == "languee_nlp.http" and "Request completed" in r.getMessage()
    ]
    assert len(completion_records) == 1


def test_request_log_record_has_correct_fields(
    client: TestClient, caplog: pytest.LogCaptureFixture
):
    with caplog.at_level(logging.INFO, logger="languee_nlp.http"):
        client.get("/words", headers={"x-request-id": "trace-xyz"})

    completion_records = [
        r for r in caplog.records if "Request completed" in r.getMessage()
    ]
    assert len(completion_records) == 1
    record = completion_records[0]

    assert record.requestId == "trace-xyz"  # type: ignore[attr-defined]
    assert record.request["method"] == "GET"  # type: ignore[attr-defined]
    assert record.request["path"] == "/words"  # type: ignore[attr-defined]
    assert record.response["statusCode"] == 200  # type: ignore[attr-defined]
    assert isinstance(record.duration, float)  # type: ignore[attr-defined]
    assert record.http["status_code"] == 200  # type: ignore[attr-defined]


def test_request_log_does_not_capture_query_values(
    client: TestClient, caplog: pytest.LogCaptureFixture
):
    with caplog.at_level(logging.INFO, logger="languee_nlp.http"):
        client.get("/words?token=private-value&text=private-text")

    record = next(r for r in caplog.records if "Request completed" in r.getMessage())
    assert record.request["path"] == "/words"  # type: ignore[attr-defined]
    assert "url" not in record.request  # type: ignore[attr-defined]
    assert "client" not in record.request  # type: ignore[attr-defined]
    assert "private-value" not in str(record.__dict__)
    assert "private-text" not in str(record.__dict__)


def test_application_error_logs_safe_response_code(
    client: TestClient, caplog: pytest.LogCaptureFixture
):
    with caplog.at_level(logging.WARNING, logger="languee_nlp.http"):
        response = client.get("/application-error")

    assert response.status_code == 422
    record = next(r for r in caplog.records if "Request failed" in r.getMessage())
    assert record.failure["stage"] == "application"  # type: ignore[attr-defined]
    assert record.response["errorCode"] == "INPUT_INVALID"  # type: ignore[attr-defined]


def test_route_level_404_is_classified_without_reading_response_body(
    client: TestClient, caplog: pytest.LogCaptureFixture
):
    with caplog.at_level(logging.WARNING, logger="languee_nlp.http"):
        response = client.get("/missing?password=private")

    assert response.status_code == 404
    record = next(r for r in caplog.records if "Request failed" in r.getMessage())
    assert record.failure["stage"] == "route"  # type: ignore[attr-defined]
    assert record.failure["classification"] == "route_not_found"  # type: ignore[attr-defined]
    assert record.request["path"] == "/missing"  # type: ignore[attr-defined]
    assert "private" not in str(record.__dict__)


# ---------------------------------------------------------------------------
# request.client is None — no AttributeError
# ---------------------------------------------------------------------------


def test_middleware_handles_none_client_without_error():
    """When request.client is None the middleware must not raise AttributeError."""
    client = TestClient(NoClientAddress(_make_app()))
    response = client.get("/words")

    assert response.status_code == 200


def test_middleware_does_not_log_client_ip(caplog: pytest.LogCaptureFixture):
    """Request logs intentionally omit the client IP address."""
    test_client = TestClient(NoClientAddress(_make_app()))
    with caplog.at_level(logging.INFO, logger="languee_nlp.http"):
        test_client.get("/words")

    completion_records = [
        r for r in caplog.records if "Request completed" in r.getMessage()
    ]
    assert len(completion_records) == 1
    assert "client" not in completion_records[0].request  # type: ignore[attr-defined]
