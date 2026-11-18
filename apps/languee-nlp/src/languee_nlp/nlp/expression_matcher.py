"""Contextual matching for dictionary-known verb expressions."""

import unicodedata

import spacy.tokens

from languee_nlp.schemas import (
    ExpressionMatch,
    MatchCandidate,
    SelectionRange,
)

_DEPENDENCY_PATHS = {"prt", "prep", "advmod"}


def match_expressions(
    doc: spacy.tokens.Doc,
    selected_verb_range: SelectionRange,
    candidates: list[MatchCandidate],
) -> list[ExpressionMatch]:
    """Match ordered candidate components attached to the selected verb."""
    head = _selected_verb(doc, selected_verb_range)
    matches: list[tuple[ExpressionMatch, int, int]] = []
    for candidate in candidates:
        parts = _normalized_parts(candidate.canonical_text)
        if len(parts) < 2 or parts[0] != _normalize(head.lemma_):
            continue
        members = _best_component_sequence(head, parts[1:])
        if members is None:
            continue
        tokens = [head, *members]
        first = tokens[0]
        last = tokens[-1]
        match = ExpressionMatch(
            entry_id=candidate.entry_id,
            canonical_text=candidate.canonical_text,
            surface_text=" ".join(token.text for token in tokens),
            component_ranges=[
                SelectionRange(start=token.idx, end=token.idx + len(token.text))
                for token in tokens
            ],
        )
        span_length = last.idx + len(last.text) - first.idx
        matches.append((match, len(parts), span_length))

    matches.sort(
        key=lambda item: (
            -item[1],
            item[2],
            _normalize(item[0].canonical_text),
            item[0].canonical_text,
            item[0].entry_id,
        )
    )
    return [match for match, _, _ in matches]


def _selected_verb(
    doc: spacy.tokens.Doc, selected_verb_range: SelectionRange
) -> spacy.tokens.Token:
    for token in doc:
        if (
            token.idx == selected_verb_range.start
            and token.idx + len(token.text) == selected_verb_range.end
            and token.pos_ == "VERB"
        ):
            return token
    raise ValueError("SELECTION_DOES_NOT_MATCH_INPUT")


def _best_component_sequence(
    head: spacy.tokens.Token, parts: list[str]
) -> list[spacy.tokens.Token] | None:
    sentence = [token for token in head.sent if token.i > head.i]
    sequences: list[list[spacy.tokens.Token]] = []

    def search(
        part_index: int,
        previous_index: int,
        matched: list[spacy.tokens.Token],
    ) -> None:
        if part_index == len(parts):
            sequences.append(matched)
            return
        for token in sentence:
            if token.i <= previous_index or not _matches_part(token, parts[part_index]):
                continue
            members = [head, *matched, token]
            allowed = {member.i for member in members}
            if not _attached_to_head(token, head, allowed):
                continue
            if _has_separated_object(head, token):
                continue
            search(part_index + 1, token.i, [*matched, token])

    search(0, head.i, [])
    if not sequences:
        return None
    return min(
        sequences,
        key=lambda sequence: (
            sequence[-1].idx + len(sequence[-1].text) - head.idx,
            tuple(token.i for token in sequence),
        ),
    )


def _attached_to_head(
    token: spacy.tokens.Token, head: spacy.tokens.Token, allowed: set[int]
) -> bool:
    current = token
    visited: set[int] = set()
    while current.i != head.i:
        if current.i in visited or current.i not in allowed:
            return False
        if current.dep_ not in _DEPENDENCY_PATHS:
            return False
        visited.add(current.i)
        current = current.head
    return True


def _has_separated_object(
    head: spacy.tokens.Token, candidate: spacy.tokens.Token
) -> bool:
    return (
        candidate.dep_ == "prep"
        and candidate.head.i == head.i
        and any(
            child.dep_ in {"dobj", "obj"} and child.i < candidate.i
            for child in head.children
        )
    )


def _matches_part(token: spacy.tokens.Token, part: str) -> bool:
    return part in {_normalize(token.text), _normalize(token.lemma_)}


def _normalized_parts(text: str) -> list[str]:
    return [_normalize(part) for part in text.split()]


def _normalize(text: str) -> str:
    return unicodedata.normalize("NFC", text).casefold()
