"""Tests for RequestLoggingMiddleware."""

from __future__ import annotations

import logging
from unittest.mock import patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

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

    return app


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


# ---------------------------------------------------------------------------
# request.client is None — no AttributeError
# ---------------------------------------------------------------------------


def test_middleware_handles_none_client_without_error():
    """When request.client is None the middleware must not raise AttributeError."""
    from starlette.requests import Request
    from starlette.testclient import TestClient as StarletteTestClient

    app = FastAPI()
    app.add_middleware(RequestLoggingMiddleware)

    @app.get("/words")
    def words():
        return {"result": "ok"}

    original_dispatch = RequestLoggingMiddleware.dispatch

    async def patched_dispatch(self, request: Request, call_next):
        # Force request.client to be None
        request._client = None  # type: ignore[attr-defined]
        return await original_dispatch(self, request, call_next)

    with patch.object(RequestLoggingMiddleware, "dispatch", patched_dispatch):
        starlette_client = StarletteTestClient(app)
        response = starlette_client.get("/words")

    assert response.status_code == 200


def test_middleware_client_none_logs_none_ip(caplog: pytest.LogCaptureFixture):
    """When client is None, the logged request.client field must be None (not raise)."""
    from starlette.requests import Request

    app = FastAPI()
    app.add_middleware(RequestLoggingMiddleware)

    @app.get("/check")
    def check():
        return {"ok": True}

    original_dispatch = RequestLoggingMiddleware.dispatch

    async def patched_dispatch(self, request: Request, call_next):
        # Patch the client property to return None on this request instance
        with patch.object(
            type(request),
            "client",
            new_callable=lambda: property(lambda self: None),
        ):
            return await original_dispatch(self, request, call_next)

    with patch.object(RequestLoggingMiddleware, "dispatch", patched_dispatch):
        test_client = TestClient(app)
        with caplog.at_level(logging.INFO, logger="languee_nlp.http"):
            test_client.get("/check")

    completion_records = [
        r for r in caplog.records if "Request completed" in r.getMessage()
    ]
    assert len(completion_records) == 1
    assert completion_records[0].request["client"] is None  # type: ignore[attr-defined]
