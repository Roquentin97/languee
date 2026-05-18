from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: str


class ReadyResponse(BaseModel):
    model: str
    vocab_size: int
    lang: str


class WordResponse(BaseModel):
    word: str
    lemma: str
    part_of_speech: str
    is_out_of_vocabulary: bool
    has_vector: bool
    probability: float


class ErrorResponse(BaseModel):
    detail: str
