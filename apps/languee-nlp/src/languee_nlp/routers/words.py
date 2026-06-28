import logging
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
    InputTextAnalysis,
    WordAnalysisResponse,
)
from languee_nlp.settings import settings

logger = logging.getLogger(__name__)

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
    if data.get("input_text_analysis") is None:
        data.pop("input_text_analysis", None)
    return JSONResponse(content=data)


def _sanitize_single_word(value: str) -> str:
    sanitized = unicodedata.normalize("NFC", value.strip().lower())
    if not sanitized:
        logger.info(
            "invalid input rejected",
            extra={
                "event": "nlp.invalid_input",
                "method": _sanitize_single_word.__name__,
                "data": {"raw_value": value},
            },
        )
        raise HTTPException(
            status_code=400,
            detail="word must be a single word; multi-word input is not supported",
        )

    if any(c.isspace() for c in sanitized):
        logger.info(
            "invalid input rejected",
            extra={
                "event": "nlp.invalid_input",
                "method": _sanitize_single_word.__name__,
                "data": {"raw_value": value},
            },
        )
        raise HTTPException(
            status_code=400,
            detail="word must be a single word; multi-word input is not supported",
        )
    return sanitized


def _analyze_isolated_word(word: str) -> JSONResponse:
    sanitized = _sanitize_single_word(word)
    doc = get_nlp()(sanitized)

    logger.debug(
        "tokenized",
        extra={
            "event": "nlp.tokenized",
            "method": _analyze_isolated_word.__name__,
            "data": {"word": sanitized, "token_count": len(doc)},
        },
    )

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


def _find_word_span(input_text: str, word: str) -> tuple[str, int, int]:
    context = unicodedata.normalize("NFC", input_text)
    sanitized = _sanitize_single_word(word)
    selection_start = context.lower().find(sanitized)

    if selection_start == -1:
        logger.warning(
            "word not found in context",
            extra={
                "event": "nlp.word_not_in_context",
                "method": _find_word_span.__name__,
                "data": {"word": word, "context_length": len(context)},
            },
        )
        raise HTTPException(
            status_code=422,
            detail="SELECTION_DOES_NOT_MATCH_INPUT",
        )

    selection_end = selection_start + len(sanitized)
    logger.debug(
        "word located in context",
        extra={
            "event": "nlp.word_located",
            "method": _find_word_span.__name__,
            "data": {
                "word": word,
                "selection_start": selection_start,
                "selection_end": selection_end,
            },
        },
    )
    return context, selection_start, selection_end


def _analyze_word_in_input_text(word: str, input_text: str) -> JSONResponse:
    context, selection_start, selection_end = _find_word_span(input_text, word)
    sanitized = _sanitize_single_word(word)
    result = resolve_token_from_context(
        get_nlp(),
        sanitized,
        context,
        selection_start,
        selection_end,
    )
    token_result = analyze_single_token(result.token)
    logger.info(
        "token resolved from context",
        extra={
            "event": "nlp.token_resolved_from_context",
            "method": _analyze_word_in_input_text.__name__,
            "data": {
                "word": sanitized,
                "matched_text": result.token.text,
                "confidence": result.confidence,
            },
        },
    )
    input_text_analysis = InputTextAnalysis(
        input_found_in_text=True,
        matched_text=result.token.text,
        matched_token_index=result.matched_token_index,
        pos_source="input_text",
        confidence=result.confidence,  # type: ignore[arg-type]
        detected_expression=result.detected_expression,
        warnings=result.warnings,
    )
    return _serialize_response(
        WordAnalysisResponse(
            input_text=sanitized,
            is_multi_word=False,
            tokens=[token_result],
            input_text_analysis=input_text_analysis,
        )
    )


@router.get(
    "",
    response_model=WordAnalysisResponse,
    summary="Analyze a word with optional input text context",
    dependencies=[Depends(require_basic_auth)],
)
def analyze_word(
    word: Annotated[
        str,
        Query(
            description="Single word to analyze.",
        ),
    ],
    input_text: Annotated[
        str | None,
        Query(
            description="Optional text containing the word for contextual analysis.",
        ),
    ] = None,
) -> JSONResponse:
    logger.debug(
        "request",
        extra={
            "event": "nlp.request",
            "method": analyze_word.__name__,
            "data": {
                "word": word,
                "has_input_text": input_text is not None and bool(input_text.strip()),
            },
        },
    )
    if input_text is None or not input_text.strip():
        return _analyze_isolated_word(word)

    return _analyze_word_in_input_text(word, input_text)
