from fastapi import APIRouter
from fastapi.responses import JSONResponse

from languee_nlp.nlp.provider import get_nlp
from languee_nlp.schemas import ErrorResponse, HealthResponse, ReadyResponse
from languee_nlp.settings import settings

router = APIRouter(tags=["health"])


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Health check",
)
def health() -> HealthResponse:
    return HealthResponse(status="ok")


@router.get(
    "/ready",
    response_model=ReadyResponse,
    responses={
        503: {"model": ErrorResponse},
        500: {"model": ErrorResponse},
    },
    summary="Readiness check",
)
def ready() -> ReadyResponse | JSONResponse:
    try:
        nlp = get_nlp()
        return ReadyResponse(
            model=settings.spacy_model,
            vocab_size=len(nlp.vocab),
            lang=nlp.lang,
        )
    except OSError:
        return JSONResponse(
            status_code=503,
            content=ErrorResponse(
                detail=f"spaCy model not available: {settings.spacy_model}"
            ).model_dump(),
        )
    except Exception:
        return JSONResponse(
            status_code=500,
            content=ErrorResponse(
                detail="Unexpected error loading spaCy model"
            ).model_dump(),
        )
