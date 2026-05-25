import secrets
import unicodedata
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import JSONResponse
from fastapi.security import HTTPBasic, HTTPBasicCredentials

from languee_nlp.nlp.context_resolver import resolve_token_from_context
from languee_nlp.nlp.provider import get_nlp
from languee_nlp.nlp.word_service import analyze_single_token
from languee_nlp.schemas import (
    ContextAnalysis,
    WordAnalysisRequest,
    WordAnalysisResponse,
)
from languee_nlp.settings import settings

router = APIRouter(prefix="/words", tags=["words"])
security = HTTPBasic()


def require_basic_auth(
    credentials: Annotated[HTTPBasicCredentials, Depends(security)],
) -> None:
    valid_login = secrets.compare_digest(credentials.username, settings.basic_login)
    valid_password = secrets.compare_digest(
        credentials.password,
        settings.basic_password,
    )
    if not valid_login or not valid_password:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid basic auth credentials",
            headers={"WWW-Authenticate": "Basic"},
        )


def _serialize_response(response: WordAnalysisResponse) -> JSONResponse:
    """Serialize response omitting only top-level None fields."""
    data = response.model_dump()
    if data.get("context") is None:
        data.pop("context", None)
    if data.get("context_analysis") is None:
        data.pop("context_analysis", None)
    return JSONResponse(content=data)


@router.get(
    "",
    response_model=WordAnalysisResponse,
    summary="Analyze a word",
    dependencies=[Depends(require_basic_auth)],
)
def analyze_word(
    word: Annotated[
        str,
        Query(
            description="Single word to analyze.",
        ),
    ],
) -> JSONResponse:
    sanitized = unicodedata.normalize("NFC", word.strip().lower())

    if not sanitized:
        raise HTTPException(
            status_code=400,
            detail="word must be a single word; multi-word input is not supported",
        )

    if any(c.isspace() for c in sanitized):
        raise HTTPException(
            status_code=400,
            detail="word must be a single word; multi-word input is not supported",
        )

    doc = get_nlp()(sanitized)

    if len(doc) == 0 or len(doc) > 1:
        raise HTTPException(
            status_code=400,
            detail="word must be a single word; multi-word input is not supported",
        )

    token_result = analyze_single_token(doc[0])
    return _serialize_response(
        WordAnalysisResponse(
            input_text=sanitized,
            is_multi_word=False,
            tokens=[token_result],
        )
    )


@router.post(
    "",
    response_model=WordAnalysisResponse,
    summary="Analyze a word with optional context",
    dependencies=[Depends(require_basic_auth)],
)
def analyze_word_post(body: WordAnalysisRequest) -> JSONResponse:
    sanitized = unicodedata.normalize("NFC", body.input_text.strip().lower())

    if not sanitized or any(c.isspace() for c in sanitized):
        raise HTTPException(
            status_code=400,
            detail="word must be a single word; multi-word input is not supported",
        )

    if body.context is not None:
        result = resolve_token_from_context(
            get_nlp(),
            sanitized,
            body.context,
            body.selection_start,  # type: ignore[arg-type]
            body.selection_end,  # type: ignore[arg-type]
        )
        token_result = analyze_single_token(result.token)
        context_analysis = ContextAnalysis(
            input_found_in_context=True,
            matched_text=result.token.text,
            matched_token_index=result.matched_token_index,
            pos_source="context",
            confidence=result.confidence,  # type: ignore[arg-type]
            detected_expression=result.detected_expression,
            warnings=result.warnings,
        )
        return _serialize_response(
            WordAnalysisResponse(
                input_text=sanitized,
                is_multi_word=False,
                tokens=[token_result],
                context=body.context,
                context_analysis=context_analysis,
            )
        )

    doc = get_nlp()(sanitized)

    if len(doc) == 0 or len(doc) > 1:
        raise HTTPException(
            status_code=400,
            detail="word must be a single word; multi-word input is not supported",
        )

    token_result = analyze_single_token(doc[0])
    return _serialize_response(
        WordAnalysisResponse(
            input_text=sanitized,
            is_multi_word=False,
            tokens=[token_result],
        )
    )
