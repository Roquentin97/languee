import logging
import unicodedata

import spacy.language
import spacy.tokens

from languee_nlp.schemas import ContextMatch

logger = logging.getLogger(__name__)

_PARTICLE_LIKE_POS = {"ADP", "PART"}
_OBJECT_NP_POS = {"NOUN", "PROPN"}
_MAX_GAP = 3


def classify_expression(tokens: list[spacy.tokens.Token]) -> str:
    """Return "phrasal_verb" when the head token is a VERB followed by a
    particle/adposition, otherwise "expression".

    The ADP/PART POS fallback exists because a preposition-like word directly
    forming a phrasal verb with a verb (e.g. "give up", "look up") is common
    in English and not reliably tagged with the Universal Dependencies "prt"
    relation by spaCy's English models.
    """
    head = tokens[0]
    if head.pos_ != "VERB":
        return "expression"

    later = tokens[1:]
    if any(tok.dep_ == "prt" for tok in later):
        return "phrasal_verb"
    if any(tok.pos_ in _PARTICLE_LIKE_POS for tok in later):
        return "phrasal_verb"
    return "expression"


def compute_head_lemma(tokens: list[spacy.tokens.Token]) -> str:
    """Lemma of the first VERB token, else lemma of the first token."""
    for tok in tokens:
        if tok.pos_ == "VERB":
            return tok.lemma_
    return tokens[0].lemma_


def compute_canonical(
    tokens: list[spacy.tokens.Token],
    sanitized_expression: str,
    kind: str,
    head_lemma: str,
) -> str:
    """Head-verb lemma joined with the remaining non-object token text for
    phrasal verbs; the sanitized expression unchanged for idioms/expressions.

    For phrasal verbs, separated-object tokens are stripped so a selection
    like "turn it off" or "look the word up" canonicalises to the dictionary
    form ("turn off", "look up"). If stripping would leave nothing after the
    verb, the full remainder is kept unchanged.
    """
    if kind == "phrasal_verb":
        remainder = tokens[1:]
        kept = _strip_object_tokens(remainder) or remainder
        return " ".join([head_lemma, *(tok.text for tok in kept)])
    return sanitized_expression


def _is_particle_like(tok: spacy.tokens.Token) -> bool:
    return tok.dep_ == "prt" or tok.pos_ in _PARTICLE_LIKE_POS


def _strip_object_tokens(
    tokens: list[spacy.tokens.Token],
) -> list[spacy.tokens.Token]:
    """Drop object tokens from a phrasal-verb remainder.

    Rules:
    - pronouns are always dropped ("put up with it" -> "put up with");
    - a noun is dropped only when a particle/adposition follows it in the
      selection (it sits between verb and particle, so it is a separated
      object: "turn the lights off") and it is either a proper noun or has a
      determiner/pronoun attached — a bare noun that is part of the verb
      pattern survives ("take care of");
    - tokens syntactically headed by a dropped token are dropped with it
      (the determiner and adjectives go away with "lights").
    """
    dropped: set[int] = set()
    for position, tok in enumerate(tokens):
        if tok.pos_ == "PRON":
            dropped.add(tok.i)
            continue
        if tok.pos_ not in _OBJECT_NP_POS:
            continue
        particle_follows = any(
            _is_particle_like(later) for later in tokens[position + 1 :]
        )
        if not particle_follows:
            continue
        has_determiner = any(
            other.pos_ in {"DET", "PRON"} and other.head is tok for other in tokens
        )
        if tok.pos_ == "PROPN" or has_determiner:
            dropped.add(tok.i)

    changed = True
    while changed:
        changed = False
        for tok in tokens:
            if tok.i not in dropped and tok.head.i in dropped:
                dropped.add(tok.i)
                changed = True

    return [tok for tok in tokens if tok.i not in dropped]


def find_context_match(
    nlp: spacy.language.Language,
    expression_tokens: list[spacy.tokens.Token],
    head_lemma: str,
    sanitized_expression: str,
    input_text: str,
) -> ContextMatch:
    normalized_input = unicodedata.normalize("NFC", input_text)

    exact = _match_exact(normalized_input, sanitized_expression)
    if exact is not None:
        return exact

    lemma_match = _match_by_lemma(nlp, expression_tokens, head_lemma, normalized_input)
    if lemma_match is not None:
        return lemma_match

    return ContextMatch(
        found=False, matched_text=None, start=None, end=None, confidence=None
    )


def _match_exact(
    normalized_input: str, sanitized_expression: str
) -> ContextMatch | None:
    idx = normalized_input.lower().find(sanitized_expression)
    if idx == -1:
        return None
    end = idx + len(sanitized_expression)
    return ContextMatch(
        found=True,
        matched_text=normalized_input[idx:end],
        start=idx,
        end=end,
        confidence="high",
    )


def _match_by_lemma(
    nlp: spacy.language.Language,
    expression_tokens: list[spacy.tokens.Token],
    head_lemma: str,
    normalized_input: str,
) -> ContextMatch | None:
    doc = nlp(normalized_input)
    remaining = expression_tokens[1:]

    for i, tok in enumerate(doc):
        if tok.lemma_.lower() != head_lemma.lower():
            continue

        matched, low_confidence = _match_remaining(doc, i, remaining)
        if matched is None:
            continue

        head_exact = tok.text.lower() == head_lemma.lower()
        is_low = low_confidence or not head_exact

        last_tok = matched[-1] if matched else tok
        start = tok.idx
        end = last_tok.idx + len(last_tok.text)
        return ContextMatch(
            found=True,
            matched_text=normalized_input[start:end],
            start=start,
            end=end,
            confidence="low" if is_low else "high",
        )

    return None


def _match_remaining(
    doc: spacy.tokens.Doc,
    head_index: int,
    remaining: list[spacy.tokens.Token],
) -> tuple[list[spacy.tokens.Token] | None, bool]:
    """Greedily match remaining expression tokens after head_index, allowing
    up to _MAX_GAP non-matching tokens between consecutive matches.
    """
    matched: list[spacy.tokens.Token] = []
    low_confidence = False
    search_from = head_index + 1
    for exp_tok in remaining:
        exp_text = exp_tok.text.lower()
        exp_lemma = exp_tok.lemma_.lower()
        found_idx = None
        for i in range(search_from, min(search_from + _MAX_GAP + 1, len(doc))):
            candidate = doc[i]
            if candidate.text.lower() == exp_text:
                found_idx = i
                break
            if candidate.lemma_.lower() == exp_lemma:
                found_idx = i
                low_confidence = True
                break
        if found_idx is None:
            return None, low_confidence
        if found_idx != search_from:
            low_confidence = True
        matched.append(doc[found_idx])
        search_from = found_idx + 1
    return matched, low_confidence
