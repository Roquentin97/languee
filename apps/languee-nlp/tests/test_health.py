from fastapi.testclient import TestClient

from languee_nlp.main import app
from languee_nlp.settings import Settings

client = TestClient(app)


def test_health_returns_200_ok():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_default_spacy_model_is_en_core_web_md():
    s = Settings()
    assert s.spacy_model == "en_core_web_md"


def test_basic_auth_settings_are_loaded_from_env():
    s = Settings()
    assert s.basic_login == "admin"
    assert s.basic_password == "changeme"
