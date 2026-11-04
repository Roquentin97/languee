from fastapi.testclient import TestClient

from languee_nlp.main import app

client = TestClient(app)


def test_version_returns_local_default_and_unknown_commit(monkeypatch):
    monkeypatch.delenv("APP_VERSION", raising=False)
    monkeypatch.delenv("GIT_SHA", raising=False)
    response = client.get("/version")
    assert response.status_code == 200
    body = response.json()
    assert body["version"] == "0.0.0"
    assert body["commit"] == "unknown"


def test_version_reflects_git_sha(monkeypatch):
    monkeypatch.setenv("GIT_SHA", "abc1234")
    response = client.get("/version")
    assert response.status_code == 200
    assert response.json()["commit"] == "abc1234"


def test_version_reflects_app_version(monkeypatch):
    monkeypatch.setenv("APP_VERSION", "2.3.4")
    response = client.get("/version")
    assert response.status_code == 200
    assert response.json()["version"] == "2.3.4"
