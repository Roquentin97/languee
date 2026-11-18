import logging
import unicodedata

import spacy
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse

from languee_nlp.nlp.context_resolver import (
    ContextResolverResult,
    resolve_token_in_doc,
)
from languee_nlp.nlp.expression_service import (
    classify_expression,
    compute_canonical,
    compute_head_lemma,
    find_context_match,
)
from languee_nlp.nlp.provider import get_nlp
from languee_nlp.nlp.word_service import analyze_single_token
from languee_nlp.schemas import (
    AnalyzeRequest,
    ContextMatch,
    ExpressionAnalysisResponse,
    ExpressionTokenResult,
    InputTextAnalysis,
    SelectionAnalysis,
    SelectionRange,
    WordAnalysisResponse,
)
from languee_nlp.security import require_basic_auth

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/analyze", tags=["analyze"])

# This endpoint analyzes words and short phrases, not sentences. The selectable-word
# bound follows Android's Unicode letter/mark tokenization; spaCy has a separate higher
# technical limit because it can split a selected word such as a hyphenated compound.
_MAX_TOKENS = 15
_MAX_SELECTION_WORDS = 6
_SUPPORTED_LANGUAGES = {"en"}
_TOKEN_COUNT_DETAIL = f"text must contain between 1 and {_MAX_TOKENS} tokens"


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


def _normalize_selected_word(value: str) -> str:
    return unicodedata.normalize("NFC", value).lower()


def _serialize_word_response(response: WordAnalysisResponse) -> JSONResponse:
    """Serialize response omitting only the legacy optional input analysis."""
    data = response.model_dump(exclude_none=False)
    if data.get("input_text_analysis") is None:
        data.pop("input_text_analysis", None)
    return JSONResponse(content=data)


def _serialize_expression_response(
    response: ExpressionAnalysisResponse,
) -> JSONResponse:
    """Serialize response omitting only the legacy optional context match."""
    data = response.model_dump(exclude_none=False)
    if data.get("context_match") is None:
        data.pop("context_match", None)
    return JSONResponse(content=data)


def _word_character(char: str) -> bool:
    return unicodedata.category(char).startswith(("L", "M"))


def _count_manual_words(value: str) -> int:
    return len(value.split())


def _folded_with_offsets(value: str) -> tuple[str, list[int], list[int]]:
    folded: list[str] = []
    starts: list[int] = []
    ends: list[int] = []
    cluster_start = 0
    cluster = ""

    def append_cluster(start: int, value_cluster: str) -> None:
        normalized = unicodedata.normalize("NFC", value_cluster).lower()
        folded.extend(normalized)
        starts.extend([start] * len(normalized))
        ends.extend([start + len(value_cluster)] * len(normalized))

    for index, char in enumerate(value):
        if cluster and not unicodedata.category(char).startswith("M"):
            append_cluster(cluster_start, cluster)
            cluster_start = index
            cluster = char
        else:
            if not cluster:
                cluster_start = index
            cluster += char
    if cluster:
        append_cluster(cluster_start, cluster)
    return "".join(folded), starts, ends


def _find_word_span(input_text: str, word: str) -> tuple[str, int, int]:
    folded_context, starts, ends = _folded_with_offsets(input_text)
    target = _normalize_selected_word(word)
    search_from = 0
    while (index := folded_context.find(target, search_from)) != -1:
        start = starts[index]
        end = ends[index + len(target) - 1]
        has_left_boundary = start == 0 or not _word_character(input_text[start - 1])
        has_right_boundary = end == len(input_text) or not _word_character(
            input_text[end]
        )
        if has_left_boundary and has_right_boundary:
            return input_text, start, end
        search_from = index + 1

    logger.warning(
        "word not found in context",
        extra={
            "event": "nlp.word_not_in_context",
            "method": _find_word_span.__name__,
            "data": {"word": word, "context_length": len(input_text)},
        },
    )
    raise HTTPException(status_code=422, detail="SELECTION_DOES_NOT_MATCH_INPUT")


def _validate_selection_ranges(
    word: str, context: str | None, ranges: list[SelectionRange] | None
) -> None:
    if ranges is None:
        return
    if context is None or not context.strip():
        raise HTTPException(status_code=422, detail="SELECTION_DOES_NOT_MATCH_INPUT")

    expected = [_normalize_selected_word(part) for part in _sanitize_text(word).split()]
    if len(expected) != len(ranges):
        raise HTTPException(status_code=422, detail="SELECTION_DOES_NOT_MATCH_INPUT")

    previous_end = -1
    for selection, expected_word in zip(ranges, expected, strict=True):
        start, end = selection.start, selection.end
        valid_offsets = 0 <= start < end <= len(context) and start >= previous_end
        if not valid_offsets:
            raise HTTPException(
                status_code=422, detail="SELECTION_DOES_NOT_MATCH_INPUT"
            )

        selected = context[start:end]
        covers_word = (
            bool(selected)
            and all(_word_character(char) for char in selected)
            and _word_character(selected[0])
            and _word_character(selected[-1])
            and (start == 0 or not _word_character(context[start - 1]))
            and (end == len(context) or not _word_character(context[end]))
        )
        if not covers_word or _normalize_selected_word(selected) != expected_word:
            raise HTTPException(
                status_code=422, detail="SELECTION_DOES_NOT_MATCH_INPUT"
            )
        previous_end = end


def _validate_selection(
    word: str, context: str | None, start: int | None, end: int | None, count: int
) -> None:
    """Legacy single-range validator retained for direct service-level callers."""
    if start is None and end is None:
        return
    valid = (
        start is not None
        and end is not None
        and context is not None
        and bool(context.strip())
        and 0 <= start < end <= len(context)
        and count == 1
        and all(_word_character(char) for char in context[start:end])
        and _normalize_selected_word(context[start:end])
        == _normalize_selected_word(word)
        and (start == 0 or not _word_character(context[start - 1]))
        and (end == len(context) or not _word_character(context[end]))
    )
    if not valid:
        raise HTTPException(status_code=422, detail="SELECTION_DOES_NOT_MATCH_INPUT")


def _model_version(nlp: spacy.language.Language) -> str:
    meta = nlp.meta
    return f"{meta['lang']}_{meta['name']}@{meta['version']}"


def _selection_analysis(token: spacy.tokens.Token) -> SelectionAnalysis | None:
    if token.pos_ != "VERB":
        return None
    return SelectionAnalysis(
        head_lemma=token.lemma_,
        pos=token.pos_,
        head_range=SelectionRange(start=token.idx, end=token.idx + len(token.text)),
    )


def _resolve_selected_tokens(
    doc: spacy.tokens.Doc, text: str, ranges: list[SelectionRange]
) -> list[spacy.tokens.Token]:
    return [
        resolve_token_in_doc(
            doc,
            text,
            selected_range.start,
            selected_range.end,
        ).token
        for selected_range in ranges
    ]


def _selection_analysis_from_tokens(
    tokens: list[spacy.tokens.Token],
) -> SelectionAnalysis | None:
    for token in tokens:
        analysis = _selection_analysis(token)
        if analysis is not None:
            return analysis
    return None


def _analyze_isolated_word(
    doc: spacy.tokens.Doc, sanitized: str, language: str, nlp: spacy.language.Language
) -> JSONResponse:
    token_result = analyze_single_token(doc[0])
    return _serialize_word_response(
        WordAnalysisResponse(
            input_text=sanitized,
            is_multi_word=False,
            language=language,
            model_version=_model_version(nlp),
            tokens=[token_result],
            input_text_analysis=None,
            selection_analysis=None,
        )
    )


def _analyze_word_in_context(
    result: ContextResolverResult,
    word: str,
    language: str,
    nlp: spacy.language.Language,
    selection_analysis: SelectionAnalysis | None,
) -> JSONResponse:
    token_result = analyze_single_token(result.token)
    logger.info(
        "token resolved from context",
        extra={
            "event": "nlp.token_resolved_from_context",
            "method": _analyze_word_in_context.__name__,
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
            model_version=_model_version(nlp),
            tokens=[token_result],
            input_text_analysis=input_text_analysis,
            selection_analysis=selection_analysis,
        )
    )


def _analyze_expression(
    nlp: spacy.language.Language,
    doc: spacy.tokens.Doc,
    sanitized: str,
    input_text: str | None,
    language: str,
    context_doc: spacy.tokens.Doc | None,
    ranges: list[SelectionRange] | None,
    selection_analysis: SelectionAnalysis | None,
    context_tokens: list[spacy.tokens.Token] | None,
) -> JSONResponse:
    tokens = list(doc)
    analysis_tokens = tokens
    if context_tokens is not None and selection_analysis is not None:
        head_index = next(
            (
                index
                for index, token in enumerate(context_tokens)
                if token.idx == selection_analysis.head_range.start
                and token.idx + len(token.text) == selection_analysis.head_range.end
            ),
            None,
        )
        if head_index is not None:
            analysis_tokens = context_tokens[head_index:]
    kind = classify_expression(analysis_tokens)
    head_lemma = (
        selection_analysis.head_lemma
        if analysis_tokens is not tokens and selection_analysis is not None
        else compute_head_lemma(analysis_tokens)
    )
    canonical = compute_canonical(analysis_tokens, sanitized, kind, head_lemma)

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
    context_match: ContextMatch | None = None
    if input_text is not None and input_text.strip():
        if ranges is not None:
            start = ranges[0].start
            end = ranges[-1].end
            context_match = ContextMatch(
                found=True,
                matched_text=input_text[start:end],
                start=start,
                end=end,
                confidence="high",
            )
        else:
            context_match = find_context_match(
                nlp,
                tokens,
                head_lemma,
                sanitized,
                input_text,
                context_doc=context_doc,
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
            model_version=_model_version(nlp),
            tokens=token_results,
            context_match=context_match,
            selection_analysis=selection_analysis,
        )
    )


@router.post(
    "",
    response_model=WordAnalysisResponse | ExpressionAnalysisResponse,
    summary="Analyze a word or multi-word expression with optional context",
    dependencies=[Depends(require_basic_auth)],
    responses={
        400: {"description": "Unsupported language or invalid input"},
        401: {"description": "Basic authentication required"},
        422: {"description": "Invalid selection: SELECTION_DOES_NOT_MATCH_INPUT"},
    },
)
def analyze(request: AnalyzeRequest) -> JSONResponse:
    logger.debug(
        "request",
        extra={
            "event": "nlp.request",
            "method": analyze.__name__,
            "data": {
                "text": request.text,
                "language": request.language,
                "has_input_text": request.input_text is not None
                and bool(request.input_text.strip()),
            },
        },
    )
    validated_language = _validate_language(request.language)
    sanitized = _sanitize_text(request.text)
    if not sanitized:
        raise HTTPException(status_code=400, detail=_TOKEN_COUNT_DETAIL)
    if _count_manual_words(request.text) > _MAX_SELECTION_WORDS:
        raise HTTPException(status_code=400, detail="SELECTION_LIMIT_EXCEEDED")
    _validate_selection_ranges(
        request.text, request.input_text, request.selection_ranges
    )

    nlp = get_nlp(validated_language)
    doc = nlp(sanitized)
    if len(doc) == 0 or len(doc) > _MAX_TOKENS:
        raise HTTPException(status_code=400, detail=_TOKEN_COUNT_DETAIL)

    if request.input_text is None or not request.input_text.strip():
        if request.selection_ranges is not None:
            raise HTTPException(
                status_code=422, detail="SELECTION_DOES_NOT_MATCH_INPUT"
            )
        if len(doc) == 1:
            return _analyze_isolated_word(doc, sanitized, validated_language, nlp)
        return _analyze_expression(
            nlp, doc, sanitized, None, validated_language, None, None, None, None
        )

    context_doc = nlp(request.input_text)
    if len(doc) == 1:
        if request.selection_ranges:
            selected_range = request.selection_ranges[0]
            start, end = selected_range.start, selected_range.end
        else:
            _, start, end = _find_word_span(request.input_text, sanitized)
        result = resolve_token_in_doc(context_doc, sanitized, start, end)
        selection_analysis = (
            _selection_analysis(result.token)
            if request.selection_ranges is not None
            else None
        )
        return _analyze_word_in_context(
            result,
            sanitized,
            validated_language,
            nlp,
            selection_analysis,
        )

    context_tokens = (
        _resolve_selected_tokens(
            context_doc,
            sanitized,
            request.selection_ranges,
        )
        if request.selection_ranges is not None
        else None
    )
    selection_analysis = (
        _selection_analysis_from_tokens(context_tokens)
        if context_tokens is not None
        else None
    )
    return _analyze_expression(
        nlp,
        doc,
        sanitized,
        request.input_text,
        validated_language,
        context_doc,
        request.selection_ranges,
        selection_analysis,
        context_tokens,
    )
