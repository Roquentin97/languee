from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from languee_nlp.main import app
from languee_nlp.settings import Settings

client = TestClient(app)


def _make_mock_nlp(vocab_size: int = 50000, lang: str = "en") -> MagicMock:
    mock_nlp = MagicMock()
    mock_nlp.vocab.__len__ = MagicMock(return_value=vocab_size)
    mock_nlp.lang = lang
    return mock_nlp


def test_ready_returns_200_with_model_info():
    mock_nlp = _make_mock_nlp(vocab_size=50000, lang="en")
    with patch("languee_nlp.routers.health.get_nlp", return_value=mock_nlp):
        response = client.get("/ready")
    assert response.status_code == 200
    data = response.json()
    assert "model" in data
    assert "vocab_size" in data
    assert "lang" in data


def test_ready_returns_503_when_os_error():
    with patch(
        "languee_nlp.routers.health.get_nlp", side_effect=OSError("model not found")
    ):
        response = client.get("/ready")
    assert response.status_code == 503
    data = response.json()
    assert "detail" in data


def test_ready_returns_500_when_unexpected_error():
    with patch(
        "languee_nlp.routers.health.get_nlp", side_effect=RuntimeError("unexpected")
    ):
        response = client.get("/ready")
    assert response.status_code == 500
    data = response.json()
    assert "detail" in data


def test_env_override_for_spacy_model(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("LANGUEE_NLP_SPACY_MODEL", "en_core_web_sm")
    s = Settings()
    assert s.spacy_model == "en_core_web_sm"


def test_ready_503_detail_contains_overridden_model_name(
    monkeypatch: pytest.MonkeyPatch,
):
    """Edge case 4: env override to nonexistent model → /ready returns 503 with
    the overridden model name present in the detail string."""
    monkeypatch.setenv("LANGUEE_NLP_SPACY_MODEL", "xx_nonexistent_model")
    with patch(
        "languee_nlp.routers.health.get_nlp",
        side_effect=OSError("model not found"),
    ), patch(
        "languee_nlp.routers.health.settings",
        Settings(),
    ):
        response = client.get("/ready")
    assert response.status_code == 503
    data = response.json()
    assert "xx_nonexistent_model" in data["detail"]
