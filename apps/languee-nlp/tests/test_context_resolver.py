"""Tests for context_resolver.py (edge cases 4-9).

All tests use mock spaCy tokens/docs to simulate the POS and dependency
structure returned by the real model. No actual model download is required.
"""

from unittest.mock import MagicMock, patch

import pytest

from languee_nlp.nlp.context_resolver import (
    ContextResolverResult,
    resolve_token_from_context,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_token(
    text: str,
    lemma: str,
    pos: str,
    idx: int,
    token_index: int,
    dep: str = "ROOT",
    children: list | None = None,
    morph_dict: dict | None = None,
) -> MagicMock:
    tok = MagicMock()
    tok.text = text
    tok.lemma_ = lemma
    tok.pos_ = pos
    tok.idx = idx
    tok.i = token_index
    tok.dep_ = dep
    tok.morph.to_dict.return_value = morph_dict or {}
    tok.head = tok  # default: token is its own head
    tok.children = children if children is not None else []
    return tok


def _make_particle(text: str, idx: int, token_index: int, head: MagicMock) -> MagicMock:
    """Build a mock 'prt' (particle) token whose head points to head."""
    particle = MagicMock()
    particle.text = text
    particle.lemma_ = text
    particle.pos_ = "PART"
    particle.idx = idx
    particle.i = token_index
    particle.dep_ = "prt"
    particle.head = head
    particle.children = []
    return particle


def _make_nlp_from_tokens(tokens: list[MagicMock]) -> MagicMock:
    """Return a mock nlp callable that always returns a doc containing tokens.

    The doc's __iter__ is implemented as a callable that returns a fresh iterator
    each time, so that the resolver can iterate the doc in multiple loops without
    the iterator being exhausted after the first pass.
    """
    doc = MagicMock()
    # Use a side_effect callable so each call to iter(doc) gets a fresh iterator
    doc.__iter__ = MagicMock(side_effect=lambda: iter(tokens))
    doc.__len__ = MagicMock(return_value=len(tokens))
    doc.__getitem__ = MagicMock(side_effect=lambda i: tokens[i])

    nlp = MagicMock(return_value=doc)
    return nlp


# ===========================================================================
# Edge case 4: POS from contextual doc differs from isolated doc
#   ('meeting' as VERB vs NOUN) → token.pos_ reflects contextual POS
# ===========================================================================


def test_context_resolver_pos_reflects_context_not_isolated():
    # Context: "I am planning on meeting him" → 'meeting' is VERB here
    # We build a fake doc where 'meeting' token has VERB pos
    context = "I am planning on meeting him"
    word = "meeting"
    # 'meeting' starts at index 17 in the context string
    selection_start = 17
    selection_end = 24

    assert context[selection_start:selection_end] == word

    token = _make_token(
        text=word,
        lemma="meet",
        pos="VERB",
        idx=selection_start,
        token_index=4,
    )
    nlp = _make_nlp_from_tokens(
        [
            _make_token("I", "I", "PRON", 0, 0),
            _make_token("am", "be", "AUX", 2, 1),
            _make_token("planning", "plan", "VERB", 5, 2),
            _make_token("on", "on", "ADP", 14, 3),
            token,
            _make_token("him", "he", "PRON", 25, 5),
        ]
    )

    result = resolve_token_from_context(
        nlp, word, context, selection_start, selection_end
    )

    assert isinstance(result, ContextResolverResult)
    assert result.token.pos_ == "VERB"
    assert result.confidence == "high"


# ===========================================================================
# Edge case 5: 'meeting' in 'I am planning on meeting him' → pos=VERB
# ===========================================================================


def test_post_words_meeting_as_verb_in_planning_context():
    context = "I am planning on meeting him"
    word = "meeting"
    selection_start = 17
    selection_end = 24

    assert context[selection_start:selection_end] == word

    meeting_token = _make_token(
        text=word,
        lemma="meet",
        pos="VERB",
        idx=selection_start,
        token_index=4,
    )
    nlp = _make_nlp_from_tokens(
        [
            _make_token("I", "I", "PRON", 0, 0),
            _make_token("am", "be", "AUX", 2, 1),
            _make_token("planning", "plan", "VERB", 5, 2),
            _make_token("on", "on", "ADP", 14, 3),
            meeting_token,
            _make_token("him", "he", "PRON", 25, 5),
        ]
    )

    with patch("languee_nlp.routers.words.get_nlp", return_value=nlp):
        with patch("languee_nlp.nlp.word_service.getInflection", return_value=()):
            from fastapi.testclient import TestClient

            from languee_nlp.main import app

            client = TestClient(app)
            response = client.get(
                "/words",
                params={
                    "word": word,
                    "input_text": context,
                },
                auth=("admin", "changeme"),
            )

    assert response.status_code == 200
    body = response.json()
    assert body["tokens"][0]["pos"] == "VERB"
    assert body["input_text_analysis"]["pos_source"] == "input_text"


# ===========================================================================
# Edge case 6: 'meeting' in 'I went to a meeting' → pos=NOUN
# ===========================================================================


def test_post_words_meeting_as_noun_in_went_to_context():
    context = "I went to a meeting"
    word = "meeting"
    selection_start = 12
    selection_end = 19

    assert context[selection_start:selection_end] == word

    meeting_token = _make_token(
        text=word,
        lemma="meeting",
        pos="NOUN",
        idx=selection_start,
        token_index=4,
    )
    nlp = _make_nlp_from_tokens(
        [
            _make_token("I", "I", "PRON", 0, 0),
            _make_token("went", "go", "VERB", 2, 1),
            _make_token("to", "to", "ADP", 7, 2),
            _make_token("a", "a", "DET", 10, 3),
            meeting_token,
        ]
    )

    with patch("languee_nlp.routers.words.get_nlp", return_value=nlp):
        with patch("languee_nlp.nlp.word_service.getInflection", return_value=()):
            from fastapi.testclient import TestClient

            from languee_nlp.main import app

            client = TestClient(app)
            response = client.get(
                "/words",
                params={
                    "word": word,
                    "input_text": context,
                },
                auth=("admin", "changeme"),
            )

    assert response.status_code == 200
    body = response.json()
    assert body["tokens"][0]["pos"] == "NOUN"
    assert body["input_text_analysis"]["pos_source"] == "input_text"


# ===========================================================================
# Edge case 7: 'saw' at offset targeting first 'saw' (VERB) in 'I saw the saw.'
# ===========================================================================


def test_context_resolver_first_saw_is_verb():
    context = "I saw the saw."
    word = "saw"
    # first 'saw' at idx=2
    selection_start = 2
    selection_end = 5

    assert context[selection_start:selection_end] == word

    saw_verb = _make_token("saw", "see", "VERB", idx=2, token_index=1)
    saw_noun = _make_token("saw", "saw", "NOUN", idx=10, token_index=3)
    nlp = _make_nlp_from_tokens(
        [
            _make_token("I", "I", "PRON", 0, 0),
            saw_verb,
            _make_token("the", "the", "DET", 6, 2),
            saw_noun,
            _make_token(".", ".", "PUNCT", 13, 4),
        ]
    )

    result = resolve_token_from_context(
        nlp, word, context, selection_start, selection_end
    )

    assert result.token.pos_ == "VERB"
    assert result.token.lemma_ == "see"
    assert result.matched_token_index == 1
    assert result.confidence == "high"


# ===========================================================================
# Edge case 8: 'saw' at offset targeting second 'saw' (NOUN) in 'I saw the saw.'
# ===========================================================================


def test_context_resolver_second_saw_is_noun():
    context = "I saw the saw."
    word = "saw"
    # second 'saw' at idx=10
    selection_start = 10
    selection_end = 13

    assert context[selection_start:selection_end] == word

    saw_verb = _make_token("saw", "see", "VERB", idx=2, token_index=1)
    saw_noun = _make_token("saw", "saw", "NOUN", idx=10, token_index=3)
    nlp = _make_nlp_from_tokens(
        [
            _make_token("I", "I", "PRON", 0, 0),
            saw_verb,
            _make_token("the", "the", "DET", 6, 2),
            saw_noun,
            _make_token(".", ".", "PUNCT", 13, 4),
        ]
    )

    result = resolve_token_from_context(
        nlp, word, context, selection_start, selection_end
    )

    assert result.token.pos_ == "NOUN"
    assert result.token.lemma_ == "saw"
    assert result.matched_token_index == 3
    assert result.confidence == "high"


# ===========================================================================
# Edge case 9: 'gave' in 'He gave up smoking.' →
#              detected_expression='give up', warnings contains
#              SELECTED_WORD_PART_OF_EXPRESSION
# ===========================================================================


def test_context_resolver_gave_up_phrasal_verb_detected():
    context = "He gave up smoking."
    word = "gave"
    selection_start = 3
    selection_end = 7

    assert context[selection_start:selection_end] == word

    gave_token = _make_token("gave", "give", "VERB", idx=3, token_index=1)
    # 'up' is a particle whose head is 'gave'
    up_particle = _make_particle("up", idx=8, token_index=2, head=gave_token)
    # set up children on gave_token to include the particle
    gave_token.children = [up_particle]
    gave_token.head = gave_token

    nlp = _make_nlp_from_tokens(
        [
            _make_token("He", "he", "PRON", 0, 0),
            gave_token,
            up_particle,
            _make_token("smoking", "smoke", "VERB", 11, 3),
            _make_token(".", ".", "PUNCT", 18, 4),
        ]
    )

    result = resolve_token_from_context(
        nlp, word, context, selection_start, selection_end
    )

    assert result.detected_expression == "give up"
    assert "SELECTED_WORD_PART_OF_EXPRESSION" in result.warnings


# ===========================================================================
# Fallback overlap path: no exact char-offset match, but partial overlap exists
# → confidence="low", SELECTION_OFFSET_MISMATCH warning
# ===========================================================================


def test_context_resolver_fallback_overlap_sets_low_confidence_and_warning():
    """When selection offsets partially overlap a token but don't exactly match
    its boundaries, the resolver falls back to best-overlap matching, sets
    confidence='low', and appends SELECTION_OFFSET_MISMATCH to warnings."""
    context = "I went to a meeting"
    word = "meeting"

    # 'meeting' starts at idx=12, length=7, so exact span is [12,19).
    # We pass start=11 (one char before the token), end=19 — overlap exists but
    # tok.idx (12) != selection_start (11), so exact-match branch is skipped
    # and the fallback overlap logic runs.
    selection_start = 11
    selection_end = 19

    # The schema validator would block this for the route (context[11:19]=" meeting"
    # != "meeting"), but we test the resolver function directly here.

    # _make_token sets tok.text as a plain str, so len(tok.text) works correctly.
    nlp = _make_nlp_from_tokens(
        [
            _make_token("I", "I", "PRON", 0, 0),
            _make_token("went", "go", "VERB", 2, 1),
            _make_token("to", "to", "ADP", 7, 2),
            _make_token("a", "a", "DET", 10, 3),
            _make_token("meeting", "meeting", "NOUN", idx=12, token_index=4),
        ]
    )

    result = resolve_token_from_context(
        nlp, word, context, selection_start, selection_end
    )

    assert result.confidence == "low"
    assert "SELECTION_OFFSET_MISMATCH" in result.warnings
    assert result.token.text == "meeting"


# ===========================================================================
# Edge case: whitespace / between-tokens offset → 422 from context_resolver
# (resolver raises HTTPException when no overlap found)
# ===========================================================================


def test_context_resolver_raises_422_for_whitespace_offset():
    """When selection_start:selection_end covers only whitespace the resolver
    raises HTTPException(422, SELECTION_DOES_NOT_MATCH_INPUT)."""
    from fastapi import HTTPException

    context = "I went to a meeting"
    word = "meeting"
    # offset 11 is the space between 'a' and 'meeting'
    selection_start = 11
    selection_end = 11  # empty slice

    tokens = [
        _make_token("I", "I", "PRON", 0, 0),
        _make_token("went", "go", "VERB", 2, 1),
        _make_token("to", "to", "ADP", 7, 2),
        _make_token("a", "a", "DET", 10, 3),
        _make_token("meeting", "meeting", "NOUN", 12, 4),
    ]
    nlp = _make_nlp_from_tokens(tokens)

    with pytest.raises(HTTPException) as exc_info:
        resolve_token_from_context(nlp, word, context, selection_start, selection_end)

    assert exc_info.value.status_code == 422
    assert exc_info.value.detail == "SELECTION_DOES_NOT_MATCH_INPUT"
