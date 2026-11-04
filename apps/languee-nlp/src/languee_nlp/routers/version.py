import os

from fastapi import APIRouter

from languee_nlp.schemas import VersionResponse

router = APIRouter(tags=["version"])


@router.get(
    "/version",
    response_model=VersionResponse,
    summary="Service version",
)
def version() -> VersionResponse:
    return VersionResponse(
        version=os.getenv("APP_VERSION", "0.0.0"),
        commit=os.getenv("GIT_SHA", "unknown"),
    )
