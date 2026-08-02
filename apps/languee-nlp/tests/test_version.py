from fastapi.testclient import TestClient

from languee_nlp.main import app

client = TestClient(app)


def test_version_returns_version_and_commit(monkeypatch):
    monkeypatch.delenv("GIT_SHA", raising=False)
    response = client.get("/version")
    assert response.status_code == 200
    body = response.json()
    assert isinstance(body["version"], str)
    assert body["commit"] == "unknown"


def test_version_reflects_git_sha(monkeypatch):
    monkeypatch.setenv("GIT_SHA", "abc1234")
    response = client.get("/version")
    assert response.status_code == 200
    assert response.json()["commit"] == "abc1234"
