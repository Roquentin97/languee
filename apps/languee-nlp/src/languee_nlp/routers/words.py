import logging
import unicodedata
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse

from languee_nlp.nlp.context_resolver import resolve_token_from_context
from languee_nlp.nlp.provider import get_nlp
from languee_nlp.nlp.word_service import analyze_single_token
from languee_nlp.schemas import (
    InputTextAnalysis,
    WordAnalysisResponse,
)
from languee_nlp.security import require_basic_auth

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/words", tags=["words"])

_SUPPORTED_LANGUAGES = {"en", "es"}


def _validate_language(language: str) -> str:
    if language not in _SUPPORTED_LANGUAGES:
        logger.info(
            "unsupported language rejected",
            extra={
                "event": "nlp.unsupported_language",
                "method": _validate_language.__name__,
                "data": {"language": language},
            },
        )
        raise HTTPException(status_code=400, detail="LANGUAGE_NOT_SUPPORTED")
    return language


def _serialize_response(response: WordAnalysisResponse) -> JSONResponse:
    """Serialize response omitting top-level None fields and null
    `extra_forms` inside each token."""
    data = response.model_dump()
    if data.get("input_text_analysis") is None:
        data.pop("input_text_analysis", None)
    for token in data.get("tokens", []):
        if token.get("extra_forms") is None:
            token.pop("extra_forms", None)
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


def _analyze_isolated_word(word: str, language: str) -> JSONResponse:
    sanitized = _sanitize_single_word(word)
    doc = get_nlp(language)(sanitized)

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

    token_result = analyze_single_token(doc[0], language)
    return _serialize_response(
        WordAnalysisResponse(
            input_text=sanitized,
            is_multi_word=False,
            language=language,
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


def _analyze_word_in_input_text(
    word: str, input_text: str, language: str
) -> JSONResponse:
    context, selection_start, selection_end = _find_word_span(input_text, word)
    sanitized = _sanitize_single_word(word)
    result = resolve_token_from_context(
        get_nlp(language),
        sanitized,
        context,
        selection_start,
        selection_end,
    )
    token_result = analyze_single_token(result.token, language)
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
            language=language,
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
    language: Annotated[
        str,
        Query(description="Language of the word: 'en' or 'es'."),
    ] = "en",
) -> JSONResponse:
    logger.debug(
        "request",
        extra={
            "event": "nlp.request",
            "method": analyze_word.__name__,
            "data": {
                "word": word,
                "language": language,
                "has_input_text": input_text is not None and bool(input_text.strip()),
            },
        },
    )
    validated_language = _validate_language(language)
    if input_text is None or not input_text.strip():
        return _analyze_isolated_word(word, validated_language)

    return _analyze_word_in_input_text(word, input_text, validated_language)
