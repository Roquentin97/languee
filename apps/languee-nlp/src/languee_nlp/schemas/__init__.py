from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: str


class ReadyResponse(BaseModel):
    model: str
    vocab_size: int
    lang: str


class ErrorResponse(BaseModel):
    detail: str
