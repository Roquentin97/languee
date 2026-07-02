from typing import Literal

from pydantic import BaseModel, ConfigDict


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
    extra_forms: dict[str, str] | None = None


class InputTextAnalysis(BaseModel):
    input_found_in_text: bool
    matched_text: str | None
    matched_token_index: int | None
    pos_source: Literal["input_text", "isolated_word"]
    confidence: Literal["high", "low"]
    detected_expression: str | None
    warnings: list[str]


class WordAnalysisResponse(BaseModel):
    model_config = ConfigDict(exclude_none=True)

    input_text: str
    is_multi_word: bool
    language: str
    tokens: list[TokenResult]
    input_text_analysis: InputTextAnalysis | None = None


class ExpressionTokenResult(BaseModel):
    text: str
    lemma: str
    pos: str


class ContextMatch(BaseModel):
    found: bool
    matched_text: str | None
    start: int | None
    end: int | None
    confidence: Literal["high", "low"] | None


class ExpressionAnalysisResponse(BaseModel):
    model_config = ConfigDict(exclude_none=True)

    input_text: str
    canonical: str
    kind: Literal["phrasal_verb", "expression"]
    head_lemma: str
    language: str
    tokens: list[ExpressionTokenResult]
    context_match: ContextMatch | None = None
