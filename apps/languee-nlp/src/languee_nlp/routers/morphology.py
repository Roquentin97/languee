from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query

from languee_nlp.nlp.morphology import (
    InflectionForm,
    LemmaCandidate,
    Pos,
    find_candidates,
    get_inflections,
    normalize,
)
from languee_nlp.routers.analyze import _validate_language
from languee_nlp.security import require_basic_auth

router = APIRouter(
    prefix="/morphology",
    tags=["morphology"],
    dependencies=[Depends(require_basic_auth)],
    responses={
        400: {"description": "Unsupported language or invalid single word"},
        401: {"description": "Basic authentication required"},
    },
)
Text = Annotated[str, Query(min_length=1, max_length=200)]


def _word(text: str, language: str) -> str:
    _validate_language(language)
    word = normalize(text)
    if not word or any(c.isspace() for c in word):
        raise HTTPException(status_code=400, detail="Expected a single word")
    return word


@router.get("/lemmas", summary="Find lemmas across parts of speech")
def lemmas(text: Text, language: str = "en") -> list[LemmaCandidate]:
    return find_candidates(_word(text, language))


@router.get("/inflections", summary="Generate a canonical lemma/POS paradigm")
def inflections(
    text: Text, partOfSpeech: Pos, language: str = "en"
) -> list[InflectionForm]:
    return get_inflections(_word(text, language), partOfSpeech)
