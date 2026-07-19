import logging
import unicodedata

import spacy.language
import spacy.tokens

from languee_nlp.schemas import ContextMatch

logger = logging.getLogger(__name__)

_PARTICLE_LIKE_POS = {"ADP", "PART"}
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
    """Head-verb lemma joined with remaining token text for phrasal verbs;
    the sanitized expression unchanged for idioms/expressions.
    """
    if kind == "phrasal_verb":
        remainder = [tok.text for tok in tokens[1:]]
        return " ".join([head_lemma, *remainder])
    return sanitized_expression


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
