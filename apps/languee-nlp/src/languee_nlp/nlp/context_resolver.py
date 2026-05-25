from dataclasses import dataclass, field

import spacy.language
import spacy.tokens
from fastapi import HTTPException


@dataclass
class ContextResolverResult:
    token: spacy.tokens.Token
    matched_token_index: int
    pos_source: str
    confidence: str
    detected_expression: str | None
    warnings: list[str] = field(default_factory=list)


def resolve_token_from_context(
    nlp: spacy.language.Language,
    input_text: str,
    context: str,
    selection_start: int,
    selection_end: int,
) -> ContextResolverResult:
    doc = nlp(context)

    matched_token: spacy.tokens.Token | None = None
    matched_index: int = -1
    confidence = "high"
    warnings: list[str] = []

    # Exact char-offset match
    for i, tok in enumerate(doc):
        tok_end = tok.idx + len(tok.text)
        if tok.idx == selection_start and tok_end == selection_end:
            matched_token = tok
            matched_index = i
            break

    # Fallback: find the token whose span overlaps the selection the most
    if matched_token is None:
        best_overlap = 0
        for i, tok in enumerate(doc):
            tok_start = tok.idx
            tok_end = tok.idx + len(tok.text)
            overlap = max(
                0,
                min(tok_end, selection_end) - max(tok_start, selection_start),
            )
            if overlap > best_overlap:
                best_overlap = overlap
                matched_token = tok
                matched_index = i

        if matched_token is None or best_overlap == 0:
            raise HTTPException(
                status_code=422,
                detail="SELECTION_DOES_NOT_MATCH_INPUT",
            )

        confidence = "low"
        warnings.append("SELECTION_OFFSET_MISMATCH")

    # Phrasal-verb / expression detection: look for particle children
    detected_expression: str | None = None
    particle_texts: list[str] = []
    for child in matched_token.children:
        if child.dep_ == "prt" and child.head.i == matched_token.i:
            particle_texts.append(child.text)

    if particle_texts:
        expression_parts = [matched_token.lemma_] + particle_texts
        detected_expression = " ".join(expression_parts)
        warnings.append("SELECTED_WORD_PART_OF_EXPRESSION")

    return ContextResolverResult(
        token=matched_token,
        matched_token_index=matched_index,
        pos_source="context",
        confidence=confidence,
        detected_expression=detected_expression,
        warnings=warnings,
    )
