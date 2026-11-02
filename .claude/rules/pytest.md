# Pytest Rules

## Stack

- Test runner: pytest
- API tests use FastAPI `TestClient` or `httpx`
- Tests live under `apps/languee-nlp/tests/`

## Testing Conventions

- Cover happy paths, validation failures, empty text, unsupported language/model
  behavior, model-load failures, and mapped spaCy exceptions when relevant.
- Prefer mocking the NLP provider or using lightweight deterministic fixtures unless the
  spec explicitly requires full-model behavior.
- Verify health/readiness endpoints do not perform unexpected heavy NLP work.
- Coverage threshold is 80% for service-layer code unless the spec says otherwise.
