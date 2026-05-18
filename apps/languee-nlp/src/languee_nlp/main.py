from fastapi import FastAPI
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.responses import HTMLResponse

from languee_nlp.routers.health import router as health_router
from languee_nlp.routers.words import router as words_router

OPENAPI_TAGS = [
    {
        "name": "health",
        "description": "Service health and readiness probes.",
    },
    {
        "name": "words",
        "description": "Word-level NLP operations.",
    },
]

app = FastAPI(
    title="Languee NLP API",
    summary="NLP support service for Languee.",
    description=(
        "Provides runtime health checks and spaCy model readiness information "
        "for the Languee NLP service."
    ),
    version="0.1.0",
    openapi_tags=OPENAPI_TAGS,
)

app.include_router(health_router)
app.include_router(words_router)


@app.get("/swagger", include_in_schema=False)
def swagger() -> HTMLResponse:
    return get_swagger_ui_html(
        openapi_url=app.openapi_url,
        title=f"{app.title} - Swagger UI",
    )
