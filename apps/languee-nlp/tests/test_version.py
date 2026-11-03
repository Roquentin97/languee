from fastapi.testclient import TestClient

from languee_nlp.main import app

client = TestClient(app)


def test_version_returns_version_and_commit(monkeypatch):
    monkeypatch.delenv("APP_VERSION", raising=False)
    monkeypatch.delenv("GIT_SHA", raising=False)
    response = client.get("/version")
    assert response.status_code == 200
    body = response.json()
    assert body["version"] == "0.1.0-dev"
    assert body["commit"] == "unknown"


def test_version_reflects_git_sha(monkeypatch):
    monkeypatch.setenv("APP_VERSION", "0.1.123001")
    monkeypatch.setenv("GIT_SHA", "abc1234")
    response = client.get("/version")
    assert response.status_code == 200
    assert response.json()["commit"] == "abc1234"
    assert response.json()["version"] == "0.1.123001"
