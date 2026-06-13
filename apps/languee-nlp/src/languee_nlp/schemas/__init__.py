import unicodedata
from typing import Literal

from pydantic import BaseModel, ConfigDict, model_validator


class HealthResponse(BaseModel):
    status: str


class VersionResponse(BaseModel):
    version: str


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


class WordAnalysisRequest(BaseModel):
    input_text: str
    context: str | None = None
    selection_start: int | None = None
    selection_end: int | None = None

    @model_validator(mode="after")
    def _validate_context_fields(self) -> "WordAnalysisRequest":
        if self.context is not None:
            if self.selection_start is None or self.selection_end is None:
                raise ValueError("context requires selection_start and selection_end")
            selected = self.context[self.selection_start : self.selection_end]
            normalized = unicodedata.normalize("NFC", self.input_text.strip().lower())
            if selected != normalized:
                raise ValueError("SELECTION_DOES_NOT_MATCH_INPUT")
        return self


class ContextAnalysis(BaseModel):
    input_found_in_context: bool
    matched_text: str | None
    matched_token_index: int | None
    pos_source: Literal["context", "isolated_input"]
    confidence: Literal["high", "low"]
    detected_expression: str | None
    warnings: list[str]


class WordAnalysisResponse(BaseModel):
    model_config = ConfigDict(exclude_none=True)

    input_text: str
    is_multi_word: bool
    tokens: list[TokenResult]
    context: str | None = None
    context_analysis: ContextAnalysis | None = None
