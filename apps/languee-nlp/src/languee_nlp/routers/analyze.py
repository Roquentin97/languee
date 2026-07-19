import logging
import unicodedata
from typing import Annotated

import spacy
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse

from languee_nlp.nlp.context_resolver import resolve_token_from_context
from languee_nlp.nlp.expression_service import (
    classify_expression,
    compute_canonical,
    compute_head_lemma,
    find_context_match,
)
from languee_nlp.nlp.provider import get_nlp
from languee_nlp.nlp.word_service import analyze_single_token
from languee_nlp.schemas import (
    ExpressionAnalysisResponse,
    ExpressionTokenResult,
    InputTextAnalysis,
    WordAnalysisResponse,
)
from languee_nlp.security import require_basic_auth

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/analyze", tags=["analyze"])

_MAX_TOKENS = 6
_SUPPORTED_LANGUAGES = {"en", "es", "de"}
_TOKEN_COUNT_DETAIL = "text must contain between 1 and 6 tokens"


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


def _sanitize_text(value: str) -> str:
    normalized = unicodedata.normalize("NFC", value.strip().lower())
    return " ".join(normalized.split())


def _serialize_word_response(response: WordAnalysisResponse) -> JSONResponse:
    """Serialize response omitting top-level None fields and null
    `extra_forms` inside each token."""
    data = response.model_dump()
    if data.get("input_text_analysis") is None:
        data.pop("input_text_analysis", None)
    for token in data.get("tokens", []):
        if token.get("extra_forms") is None:
            token.pop("extra_forms", None)
    return JSONResponse(content=data)


def _serialize_expression_response(
    response: ExpressionAnalysisResponse,
) -> JSONResponse:
    """Serialize response omitting only top-level None fields."""
    data = response.model_dump()
    if data.get("context_match") is None:
        data.pop("context_match", None)
    return JSONResponse(content=data)


def _find_word_span(input_text: str, word: str) -> tuple[str, int, int]:
    context = unicodedata.normalize("NFC", input_text)
    selection_start = context.lower().find(word)

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

    selection_end = selection_start + len(word)
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


def _analyze_isolated_word(
    doc: spacy.tokens.Doc, sanitized: str, language: str
) -> JSONResponse:
    token_result = analyze_single_token(doc[0], language)
    return _serialize_word_response(
        WordAnalysisResponse(
            input_text=sanitized,
            is_multi_word=False,
            language=language,
            tokens=[token_result],
        )
    )


def _analyze_word_in_input_text(
    word: str, input_text: str, language: str
) -> JSONResponse:
    context, selection_start, selection_end = _find_word_span(input_text, word)
    result = resolve_token_from_context(
        get_nlp(language),
        word,
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
                "word": word,
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
    return _serialize_word_response(
        WordAnalysisResponse(
            input_text=word,
            is_multi_word=False,
            language=language,
            tokens=[token_result],
            input_text_analysis=input_text_analysis,
        )
    )


def _analyze_expression(
    nlp: spacy.language.Language,
    doc: spacy.tokens.Doc,
    sanitized: str,
    input_text: str | None,
    language: str,
) -> JSONResponse:
    tokens = list(doc)
    kind = classify_expression(tokens, language)
    head_lemma = compute_head_lemma(tokens)
    canonical = compute_canonical(tokens, sanitized, kind, head_lemma)

    logger.info(
        "expression classified",
        extra={
            "event": "nlp.expression_classified",
            "method": _analyze_expression.__name__,
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
                "method": _analyze_expression.__name__,
                "data": {
                    "expression": sanitized,
                    "found": context_match.found,
                    "confidence": context_match.confidence,
                },
            },
        )

    return _serialize_expression_response(
        ExpressionAnalysisResponse(
            input_text=sanitized,
            canonical=canonical,
            kind=kind,
            head_lemma=head_lemma,
            language=language,
            tokens=token_results,
            context_match=context_match,
        )
    )


@router.get(
    "",
    response_model=WordAnalysisResponse | ExpressionAnalysisResponse,
    summary="Analyze a word or multi-word expression with optional context",
    dependencies=[Depends(require_basic_auth)],
)
def analyze(
    text: Annotated[
        str,
        Query(description="Word or expression to analyze (1-6 tokens)."),
    ],
    input_text: Annotated[
        str | None,
        Query(description="Optional text containing the target for context analysis."),
    ] = None,
    language: Annotated[
        str,
        Query(description="Language of the text: 'en', 'es', or 'de'."),
    ] = "en",
) -> JSONResponse:
    logger.debug(
        "request",
        extra={
            "event": "nlp.request",
            "method": analyze.__name__,
            "data": {
                "text": text,
                "language": language,
                "has_input_text": input_text is not None and bool(input_text.strip()),
            },
        },
    )
    validated_language = _validate_language(language)

    sanitized = _sanitize_text(text)
    if not sanitized:
        raise HTTPException(status_code=400, detail=_TOKEN_COUNT_DETAIL)

    nlp = get_nlp(validated_language)
    doc = nlp(sanitized)

    logger.debug(
        "tokenized",
        extra={
            "event": "nlp.tokenized",
            "method": analyze.__name__,
            "data": {"text": sanitized, "token_count": len(doc)},
        },
    )

    if len(doc) == 0 or len(doc) > _MAX_TOKENS:
        raise HTTPException(status_code=400, detail=_TOKEN_COUNT_DETAIL)

    if len(doc) == 1:
        if input_text is None or not input_text.strip():
            return _analyze_isolated_word(doc, sanitized, validated_language)
        return _analyze_word_in_input_text(sanitized, input_text, validated_language)

    return _analyze_expression(nlp, doc, sanitized, input_text, validated_language)
