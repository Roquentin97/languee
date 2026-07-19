from fastapi.testclient import TestClient

from languee_nlp.main import app

client = TestClient(app)


def test_swagger_alias_returns_swagger_ui():
    response = client.get("/swagger")

    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    assert "Swagger UI" in response.text


def test_openapi_schema_describes_health_routes():
    response = client.get("/openapi.json")

    assert response.status_code == 200
    data = response.json()
    assert data["info"]["title"] == "Languee NLP API"
    assert data["info"]["version"] == "0.1.0"
    assert "/health" in data["paths"]
    assert "/ready" in data["paths"]
    assert "/analyze" in data["paths"]
    assert data["paths"]["/health"]["get"]["tags"] == ["health"]
    assert data["paths"]["/analyze"]["get"]["tags"] == ["analyze"]
    assert "post" not in data["paths"]["/analyze"]

    parameters = data["paths"]["/analyze"]["get"]["parameters"]
    assert [parameter["name"] for parameter in parameters] == [
        "text",
        "input_text",
        "language",
    ]
    assert parameters[0]["required"] is True
    assert parameters[1]["required"] is False
    assert parameters[2]["required"] is False
