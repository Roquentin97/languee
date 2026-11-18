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
    assert data["info"]["version"] == "0.0.0"
    assert "/health" in data["paths"]
    assert "/ready" in data["paths"]
    assert "/analyze" in data["paths"]
    assert data["paths"]["/health"]["get"]["tags"] == ["health"]
    analyze = data["paths"]["/analyze"]
    assert "get" not in analyze
    assert analyze["post"]["tags"] == ["analyze"]
    request_schema = analyze["post"]["requestBody"]["content"]["application/json"]
    assert request_schema["schema"]["$ref"].endswith("/AnalyzeRequest")
    analyze_response = analyze["post"]["responses"]["200"]["content"][
        "application/json"
    ]["schema"]
    assert {"oneOf", "anyOf"} & analyze_response.keys()

    selection_analysis = data["components"]["schemas"]["SelectionAnalysis"]
    assert set(selection_analysis["required"]) == {
        "head_lemma",
        "pos",
        "head_range",
    }
    assert "/match-expressions" in data["paths"]
    assert "post" in data["paths"]["/match-expressions"]
