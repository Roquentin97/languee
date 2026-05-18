import secrets
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.security import HTTPBasic, HTTPBasicCredentials

from languee_nlp.nlp.provider import get_nlp
from languee_nlp.schemas import WordResponse
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


@router.get(
    "",
    response_model=WordResponse,
    summary="Analyze a word",
    dependencies=[Depends(require_basic_auth)],
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
