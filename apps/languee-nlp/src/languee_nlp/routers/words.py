from typing import Annotated

from fastapi import APIRouter, HTTPException, Query

from languee_nlp.nlp.provider import get_nlp
from languee_nlp.schemas import WordResponse

router = APIRouter(prefix="/words", tags=["words"])


@router.get(
    "",
    response_model=WordResponse,
    summary="Analyze a word",
)
def analyze_word(
    word: Annotated[
        str,
        Query(
            min_length=1,
            description="Single word to analyze.",
        ),
    ],
) -> WordResponse:
    normalized_word = word.strip()
    if not normalized_word or len(normalized_word.split()) != 1:
        raise HTTPException(status_code=422, detail="word must be a single word")

    doc = get_nlp()(normalized_word)
    token = doc[0]
    return WordResponse(
        word=normalized_word,
        lemma=token.lemma_,
        part_of_speech=token.pos_,
        is_out_of_vocabulary=token.is_oov,
        has_vector=token.has_vector,
        probability=token.prob,
    )
