"""Tests for POST /words endpoint (edge cases 1-3, 10-18)."""

import json
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from languee_nlp.main import app

client = TestClient(app)
AUTH = ("admin", "changeme")


# ---------------------------------------------------------------------------
# Helper: build a minimal mock token for use in context-path tests
# ---------------------------------------------------------------------------


def _make_mock_token(
    text: str = "word",
    lemma: str = "word",
    pos: str = "NOUN",
    morph_dict: dict | None = None,
    idx: int = 0,
    token_index: int = 0,
    children: list | None = None,
) -> MagicMock:
    if morph_dict is None:
        morph_dict = {}
    tok = MagicMock()
    tok.text = text
    tok.lemma_ = lemma
    tok.pos_ = pos
    tok.morph.to_dict.return_value = morph_dict
    tok.idx = idx
    tok.i = token_index
    tok.children = children if children is not None else []
    # head defaults to self (no phrasal particle)
    tok.head = tok
    return tok


def _make_single_token_nlp(
    text: str = "word",
    lemma: str = "word",
    pos: str = "NOUN",
    morph_dict: dict | None = None,
) -> MagicMock:
    """Return a mock nlp that yields a single-token doc for any input."""
    tok = _make_mock_token(text=text, lemma=lemma, pos=pos, morph_dict=morph_dict)
    doc = MagicMock()
    doc.__len__ = MagicMock(return_value=1)
    doc.__getitem__ = MagicMock(return_value=tok)
    doc.__iter__ = MagicMock(return_value=iter([tok]))
    mock_nlp = MagicMock(return_value=doc)
    return mock_nlp


# ===========================================================================
# Edge case 1: context provided but selection_start missing → 422
# ===========================================================================


def test_post_words_context_without_selection_start_returns_422():
    payload = {
        "input_text": "meeting",
        "context": "I went to a meeting",
        "selection_end": 19,
    }
    response = client.post("/words", json=payload, auth=AUTH)
    assert response.status_code == 422


# ===========================================================================
# Edge case 2: context provided but selection_end missing → 422
# ===========================================================================


def test_post_words_context_without_selection_end_returns_422():
    payload = {
        "input_text": "meeting",
        "context": "I went to a meeting",
        "selection_start": 12,
    }
    response = client.post("/words", json=payload, auth=AUTH)
    assert response.status_code == 422


# ===========================================================================
# Edge case 3: context provided, offsets provided, but slice does not match
#              input_text after normalization → 422 SELECTION_DOES_NOT_MATCH_INPUT
# ===========================================================================


def test_post_words_selection_does_not_match_input_text_returns_422():
    # "meeting" starts at index 12 in "I went to a meeting"
    # but we pass wrong offsets that select "went" instead
    payload = {
        "input_text": "meeting",
        "context": "I went to a meeting",
        "selection_start": 2,
        "selection_end": 6,  # selects "went", not "meeting"
    }
    response = client.post("/words", json=payload, auth=AUTH)
    assert response.status_code == 422
    body = response.json()
    assert "SELECTION_DOES_NOT_MATCH_INPUT" in json.dumps(body)


# ===========================================================================
# Edge case 10: no context → context and context_analysis absent from response
# ===========================================================================


def test_post_words_no_context_response_omits_context_fields():
    mock_nlp = _make_single_token_nlp(text="run", lemma="run", pos="VERB")

    with patch("languee_nlp.routers.words.get_nlp", return_value=mock_nlp):
        with patch("languee_nlp.nlp.word_service.getInflection", return_value=()):
            response = client.post("/words", json={"input_text": "run"}, auth=AUTH)

    assert response.status_code == 200
    body = response.json()
    assert "context" not in body
    assert "context_analysis" not in body


# ===========================================================================
# Edge case 11: no context, word triggers zero spaCy tokens → 400
# ===========================================================================


def test_post_words_no_context_zero_tokens_returns_400():
    doc = MagicMock()
    doc.__len__ = MagicMock(return_value=0)
    mock_nlp = MagicMock(return_value=doc)

    with patch("languee_nlp.routers.words.get_nlp", return_value=mock_nlp):
        response = client.post("/words", json={"input_text": "xyz"}, auth=AUTH)

    assert response.status_code == 400
    assert "single word" in response.json()["detail"]


# ===========================================================================
# Edge case 12: no context, multi-word input_text → 400
# ===========================================================================


def test_post_words_no_context_multiword_input_returns_400():
    response = client.post("/words", json={"input_text": "look up"}, auth=AUTH)
    assert response.status_code == 400
    assert "single word" in response.json()["detail"]


# ===========================================================================
# Edge case 13: empty input_text after normalization → 400
# ===========================================================================


def test_post_words_empty_input_after_normalization_returns_400():
    response = client.post("/words", json={"input_text": "   "}, auth=AUTH)
    assert response.status_code == 400
    assert "single word" in response.json()["detail"]


# ===========================================================================
# Edge case 14: context with offsets pointing to whitespace → 422
#               (Pydantic sees the slice != normalized input_text)
# ===========================================================================


def test_post_words_offsets_pointing_to_whitespace_returns_422():
    # "I went to a meeting" - offset 11 is the space before 'meeting'
    payload = {
        "input_text": "meeting",
        "context": "I went to a meeting",
        "selection_start": 11,  # space char
        "selection_end": 18,  # " meetin" – doesn't match "meeting"
    }
    response = client.post("/words", json=payload, auth=AUTH)
    assert response.status_code == 422


# ===========================================================================
# Edge case 15: GET /words still works (backward compatibility)
# ===========================================================================


def test_get_words_still_works_after_post_addition():
    mock_nlp = _make_single_token_nlp(text="run", lemma="run", pos="VERB")

    with patch("languee_nlp.routers.words.get_nlp", return_value=mock_nlp):
        with patch("languee_nlp.nlp.word_service.getInflection", return_value=()):
            response = client.get("/words", params={"word": "run"}, auth=AUTH)

    assert response.status_code == 200
    body = response.json()
    assert body["input_text"] == "run"
    assert body["is_multi_word"] is False
    assert len(body["tokens"]) == 1
    assert body["tokens"][0]["pos"] == "VERB"
    # GET response must not include context-specific fields
    assert "context" not in body
    assert "context_analysis" not in body


# ===========================================================================
# Edge case 16: POST /words without Basic auth credentials → 401
# ===========================================================================


def test_post_words_without_auth_returns_401():
    response = client.post("/words", json={"input_text": "run"})
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Basic"


# ===========================================================================
# Edge case 17: POST /words with wrong Basic auth credentials → 401
# ===========================================================================


def test_post_words_with_wrong_auth_returns_401():
    response = client.post(
        "/words",
        json={"input_text": "run"},
        auth=("admin", "wrong-password"),
    )
    assert response.status_code == 401


# ===========================================================================
# Edge case 18: context with valid offsets, no phrasal-verb particle →
#               detected_expression=null, warnings empty
# ===========================================================================


def test_post_words_context_no_phrasal_verb_detected_expression_null():
    # "run" in context "I like to run every day" – starts at idx 10, length 3
    context = "I like to run every day"
    word = "run"
    selection_start = 10  # "run" starts at index 10
    selection_end = 13

    assert context[selection_start:selection_end] == word

    # Build a mock token that has no prt children
    mock_token = _make_mock_token(
        text=word,
        lemma=word,
        pos="VERB",
        idx=selection_start,
        token_index=3,
        children=[],
    )
    mock_token.head = mock_token

    mock_doc = MagicMock()
    mock_doc.__iter__ = MagicMock(return_value=iter([mock_token]))
    mock_doc.__len__ = MagicMock(return_value=4)
    mock_nlp = MagicMock(return_value=mock_doc)

    payload = {
        "input_text": word,
        "context": context,
        "selection_start": selection_start,
        "selection_end": selection_end,
    }

    with patch("languee_nlp.routers.words.get_nlp", return_value=mock_nlp):
        with patch(
            "languee_nlp.nlp.context_resolver.resolve_token_from_context"
        ) as mock_resolver:
            from languee_nlp.nlp.context_resolver import ContextResolverResult

            mock_resolver.return_value = ContextResolverResult(
                token=mock_token,
                matched_token_index=3,
                pos_source="context",
                confidence="high",
                detected_expression=None,
                warnings=[],
            )
            with patch("languee_nlp.nlp.word_service.getInflection", return_value=()):
                response = client.post("/words", json=payload, auth=AUTH)

    assert response.status_code == 200
    body = response.json()
    ca = body["context_analysis"]
    assert ca["detected_expression"] is None
    assert ca["warnings"] == []
