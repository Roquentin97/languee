# FastAPI Rules

## Stack

- Runtime: Python 3.12+
- Framework: FastAPI
- Package manager: uv
- Linting and formatting: Ruff

## Python and uv Rules

- Dependencies live in `apps/languee-nlp/pyproject.toml`.
- Lock dependencies with `apps/languee-nlp/uv.lock`.
- Use `uv sync` to install dependencies.
- Run commands with `uv run`; never assume a globally activated virtualenv.
- Keep runtime and development dependencies separate in `pyproject.toml`.
- Use precise Python typing. Avoid untyped public functions.

## FastAPI Conventions

- Keep the FastAPI app importable from a stable module path, such as
  `languee_nlp.main:app`.
- Route handlers stay thin: validate input, call service/provider code, and return
  response models.
- Pydantic models define request and response contracts.
- Error responses must be deliberate and documented in the Architect plan.
- Do not add persistence unless the spec explicitly requires it.
- Update API tests and documented endpoint contracts when adding or changing requests.

## Default Structure

```text
apps/languee-nlp/
  pyproject.toml
  uv.lock
  src/languee_nlp/
    __init__.py
    main.py
    settings.py
    routers/
    schemas/
    nlp/
```
