from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class HealthResponse(BaseModel):
    status: str


class VersionResponse(BaseModel):
    version: str
    commit: str


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


class SelectionRange(BaseModel):
    start: int = Field(
        ge=0, strict=True, description="Inclusive Unicode code-point offset."
    )
    end: int = Field(
        gt=0, strict=True, description="Exclusive Unicode code-point offset."
    )

    @model_validator(mode="after")
    def validate_order(self) -> "SelectionRange":
        if self.end <= self.start:
            raise ValueError("end must be greater than start")
        return self


class AnalyzeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str = Field(description="Word or expression to analyze (1-6 words).")
    input_text: str | None = Field(
        default=None,
        description="Optional original context containing the selected text.",
    )
    language: str = Field(default="en", description="Only 'en' is supported.")
    selection_ranges: list[SelectionRange] | None = Field(
        default=None,
        min_length=1,
        max_length=6,
        description=(
            "Ordered, non-overlapping code-point ranges, one per selected word."
        ),
    )


class SelectionAnalysis(BaseModel):
    head_lemma: str
    pos: str = Field(description="spaCy Universal POS, currently 'VERB'.")
    head_range: SelectionRange


class MatchCandidate(BaseModel):
    entry_id: str
    canonical_text: str = Field(min_length=1, max_length=200)


class MatchExpressionsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    language: str = "en"
    input_text: str = Field(description="Original context to parse.")
    selected_verb_range: SelectionRange
    candidates: list[MatchCandidate]


class ExpressionMatch(BaseModel):
    entry_id: str
    canonical_text: str
    surface_text: str
    component_ranges: list[SelectionRange]


class MatchExpressionsResponse(BaseModel):
    matches: list[ExpressionMatch]


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

    kind: Literal["word"] = "word"
    input_text: str
    is_multi_word: bool
    language: str
    model_version: str = Field(
        description="Loaded spaCy model package and version, joined by @."
    )
    tokens: list[TokenResult]
    input_text_analysis: InputTextAnalysis | None = None
    selection_analysis: SelectionAnalysis | None


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
    model_version: str = Field(
        description="Loaded spaCy model package and version, joined by @."
    )
    tokens: list[ExpressionTokenResult]
    context_match: ContextMatch | None = None
    selection_analysis: SelectionAnalysis | None
