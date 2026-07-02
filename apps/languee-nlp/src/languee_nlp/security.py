import secrets
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBasic, HTTPBasicCredentials

from languee_nlp.settings import settings

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
