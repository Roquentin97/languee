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


class MorphologyResult(BaseModel):
    tense: str | None
    verb_form: str | None
    number: str | None
    degree: str | None


class FormsResult(BaseModel):
    verb_base: str | None
    verb_past: str | None
    verb_present_3sg: str | None
    verb_present_non_3sg: str | None
    verb_gerund_participle: str | None
    verb_past_participle: str | None
    noun_singular: str | None
    noun_plural: str | None
    adj_positive: str | None
    adj_comparative: str | None
    adj_superlative: str | None


class TokenResult(BaseModel):
    text: str
    lemma: str
    pos: str
    is_irregular: bool
    morphology: MorphologyResult
    forms: FormsResult


class WordAnalysisResponse(BaseModel):
    input_text: str
    is_multi_word: bool
    tokens: list[TokenResult]
