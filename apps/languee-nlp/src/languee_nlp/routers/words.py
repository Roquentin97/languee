import secrets
import unicodedata
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.security import HTTPBasic, HTTPBasicCredentials

from languee_nlp.nlp.provider import get_nlp
from languee_nlp.nlp.word_service import analyze_single_token
from languee_nlp.schemas import WordAnalysisResponse
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
) -> WordAnalysisResponse:
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
    return WordAnalysisResponse(
        input_text=sanitized,
        is_multi_word=False,
        tokens=[token_result],
    )
