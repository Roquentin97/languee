import logging
import unicodedata
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse

from languee_nlp.nlp.expression_service import (
    classify_expression,
    compute_canonical,
    compute_head_lemma,
    find_context_match,
)
from languee_nlp.nlp.provider import get_nlp
from languee_nlp.schemas import ExpressionAnalysisResponse, ExpressionTokenResult
from languee_nlp.security import require_basic_auth

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/expressions", tags=["expressions"])

_MIN_TOKENS = 2
_MAX_TOKENS = 6
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


def _serialize_response(response: ExpressionAnalysisResponse) -> JSONResponse:
    """Serialize response omitting only top-level None fields."""
    data = response.model_dump()
    if data.get("context_match") is None:
        data.pop("context_match", None)
    return JSONResponse(content=data)


def _sanitize_expression(value: str) -> str:
    normalized = unicodedata.normalize("NFC", value.strip().lower())
    return " ".join(normalized.split())


@router.get(
    "",
    response_model=ExpressionAnalysisResponse,
    summary="Analyze a multi-word expression with optional context validation",
    dependencies=[Depends(require_basic_auth)],
)
def analyze_expression(
    expression: Annotated[
        str,
        Query(description="Multi-word expression to analyze (2-6 tokens)."),
    ],
    input_text: Annotated[
        str | None,
        Query(description="Optional text to validate the expression against."),
    ] = None,
    language: Annotated[
        str,
        Query(description="Language of the expression: 'en' or 'es'."),
    ] = "en",
) -> JSONResponse:
    logger.debug(
        "request",
        extra={
            "event": "nlp.request",
            "method": analyze_expression.__name__,
            "data": {
                "expression": expression,
                "language": language,
                "has_input_text": input_text is not None and bool(input_text.strip()),
            },
        },
    )
    validated_language = _validate_language(language)

    sanitized = _sanitize_expression(expression)
    nlp = get_nlp(validated_language)
    doc = nlp(sanitized)

    logger.debug(
        "tokenized",
        extra={
            "event": "nlp.tokenized",
            "method": analyze_expression.__name__,
            "data": {"expression": sanitized, "token_count": len(doc)},
        },
    )

    if len(doc) < _MIN_TOKENS or len(doc) > _MAX_TOKENS:
        raise HTTPException(
            status_code=400,
            detail="expression must contain between 2 and 6 tokens",
        )

    tokens = list(doc)
    kind = classify_expression(tokens, validated_language)
    head_lemma = compute_head_lemma(tokens)
    canonical = compute_canonical(tokens, sanitized, kind, head_lemma)

    logger.info(
        "expression classified",
        extra={
            "event": "nlp.expression_classified",
            "method": analyze_expression.__name__,
            "data": {"expression": sanitized, "kind": kind, "canonical": canonical},
        },
    )

    token_results = [
        ExpressionTokenResult(text=tok.text, lemma=tok.lemma_, pos=tok.pos_)
        for tok in tokens
    ]

    context_match = None
    if input_text is not None and input_text.strip():
        context_match = find_context_match(
            nlp, tokens, head_lemma, sanitized, input_text
        )
        logger.info(
            "context match evaluated",
            extra={
                "event": "nlp.expression_context_match",
                "method": analyze_expression.__name__,
                "data": {
                    "expression": sanitized,
                    "found": context_match.found,
                    "confidence": context_match.confidence,
                },
            },
        )

    return _serialize_response(
        ExpressionAnalysisResponse(
            input_text=sanitized,
            canonical=canonical,
            kind=kind,
            head_lemma=head_lemma,
            language=validated_language,
            tokens=token_results,
            context_match=context_match,
        )
    )
