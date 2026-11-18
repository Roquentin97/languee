"""Stateless matching of known expression candidates in a selected sentence."""

from fastapi import APIRouter, Depends, HTTPException

from languee_nlp.nlp.expression_matcher import match_expressions
from languee_nlp.nlp.provider import get_nlp
from languee_nlp.schemas import (
    MatchExpressionsRequest,
    MatchExpressionsResponse,
)
from languee_nlp.security import require_basic_auth

router = APIRouter(tags=["analyze"])


@router.post(
    "/match-expressions",
    response_model=MatchExpressionsResponse,
    summary="Match known verb-expression candidates in context",
    dependencies=[Depends(require_basic_auth)],
    responses={
        400: {"description": "Unsupported language"},
        401: {"description": "Basic authentication required"},
        422: {"description": "Selected verb range is invalid"},
    },
)
def match_expression_candidates(
    request: MatchExpressionsRequest,
) -> MatchExpressionsResponse:
    if request.language not in {"en"}:
        raise HTTPException(status_code=400, detail="LANGUAGE_NOT_SUPPORTED")
    nlp = get_nlp(request.language)
    doc = nlp(request.input_text)
    try:
        matches = match_expressions(
            doc,
            request.selected_verb_range,
            request.candidates,
        )
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return MatchExpressionsResponse(matches=matches)
