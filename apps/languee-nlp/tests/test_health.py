from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from languee_nlp.main import app
from languee_nlp.settings import Settings

client = TestClient(app)


def test_health_returns_200_ok():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_health_does_not_call_get_nlp_even_when_nlp_raises():
    with patch(
        "languee_nlp.nlp.provider.get_nlp", side_effect=RuntimeError("should not be called")
    ):
        response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_default_spacy_model_is_en_core_web_md():
    s = Settings()
    assert s.spacy_model == "en_core_web_md"
