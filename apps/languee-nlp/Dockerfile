FROM python:3.14-slim AS base
RUN pip install uv
WORKDIR /app

FROM base AS deps
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

FROM deps AS spacy-model
RUN uv run python -m spacy download en_core_web_md

FROM spacy-model AS runtime
COPY src/ ./src/
ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONPATH=/app/src \
    PYTHONDONTWRITEBYTECODE=1
RUN useradd --create-home --shell /bin/bash nlp
USER nlp
EXPOSE 8000

FROM runtime AS development
CMD ["uvicorn", "languee_nlp.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload", "--reload-dir", "/app/src", "--no-access-log"]

FROM runtime AS production
CMD ["uvicorn", "languee_nlp.main:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]
