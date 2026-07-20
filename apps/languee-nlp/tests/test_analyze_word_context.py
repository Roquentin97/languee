"""Tests for contextual GET /analyze single-word behavior."""

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
# word is required.
# ===========================================================================


def test_get_words_missing_word_with_input_text_returns_422():
    response = client.get(
        "/analyze",
        params={"input_text": "I went to a meeting"},
        auth=AUTH,
    )
    assert response.status_code == 422


# ===========================================================================
# POST /words was replaced by GET query parameters.
# ===========================================================================


def test_post_words_is_removed():
    response = client.post("/analyze", json={"word": "run"}, auth=AUTH)
    assert response.status_code == 405


# ===========================================================================
# Input text provided but word cannot be found.
# ===========================================================================


def test_get_words_word_missing_from_input_text_returns_422():
    response = client.get(
        "/analyze",
        params={"text": "lesson", "input_text": "I went to a meeting"},
        auth=AUTH,
    )
    assert response.status_code == 422
    assert response.json()["detail"] == "SELECTION_DOES_NOT_MATCH_INPUT"


# ===========================================================================
# Edge case 10: no input_text → input_text_analysis absent from response
# ===========================================================================


def test_get_words_without_input_text_omits_input_text_analysis():
    mock_nlp = _make_single_token_nlp(text="run", lemma="run", pos="VERB")

    with patch("languee_nlp.routers.analyze.get_nlp", return_value=mock_nlp):
        with patch("languee_nlp.nlp.word_service.getInflection", return_value=()):
            response = client.get("/analyze", params={"text": "run"}, auth=AUTH)

    assert response.status_code == 200
    body = response.json()
    assert "input_text_analysis" not in body


# ===========================================================================
# Edge case 11: no selection, word triggers zero spaCy tokens → 400
# ===========================================================================


def test_get_analyze_no_input_text_zero_tokens_returns_400():
    doc = MagicMock()
    doc.__len__ = MagicMock(return_value=0)
    mock_nlp = MagicMock(return_value=doc)

    with patch("languee_nlp.routers.analyze.get_nlp", return_value=mock_nlp):
        response = client.get("/analyze", params={"text": "xyz"}, auth=AUTH)

    assert response.status_code == 400
    assert "between 1 and 10 tokens" in response.json()["detail"]


# ===========================================================================
# Edge case 13: empty text after normalization → 400
# ===========================================================================


def test_get_analyze_empty_text_after_normalization_returns_400():
    response = client.get("/analyze", params={"text": "   "}, auth=AUTH)
    assert response.status_code == 400
    assert "between 1 and 10 tokens" in response.json()["detail"]


# ===========================================================================
# Edge case 14: blank input_text is treated as absent context.
# ===========================================================================


def test_get_words_blank_input_text_falls_back_to_word():
    mock_nlp = _make_single_token_nlp(text="run", lemma="run", pos="VERB")

    with patch("languee_nlp.routers.analyze.get_nlp", return_value=mock_nlp):
        with patch("languee_nlp.nlp.word_service.getInflection", return_value=()):
            response = client.get(
                "/analyze",
                params={"text": "run", "input_text": "   "},
                auth=AUTH,
            )

    assert response.status_code == 200
    assert "input_text_analysis" not in response.json()


# ===========================================================================
# Edge case 15: GET /words handles simple word analysis.
# ===========================================================================


def test_get_words_still_handles_simple_word_analysis():
    mock_nlp = _make_single_token_nlp(text="run", lemma="run", pos="VERB")

    with patch("languee_nlp.routers.analyze.get_nlp", return_value=mock_nlp):
        with patch("languee_nlp.nlp.word_service.getInflection", return_value=()):
            response = client.get("/analyze", params={"text": "run"}, auth=AUTH)

    assert response.status_code == 200
    body = response.json()
    assert body["input_text"] == "run"
    assert body["is_multi_word"] is False
    assert len(body["tokens"]) == 1
    assert body["tokens"][0]["pos"] == "VERB"
    # GET response must not include input_text_analysis fields
    assert "input_text_analysis" not in body


# ===========================================================================
# Edge case 16: GET /words without Basic auth credentials → 401
# ===========================================================================


def test_get_words_without_auth_returns_401():
    response = client.get("/analyze", params={"text": "run"})
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Basic"


# ===========================================================================
# Edge case 17: GET /words with wrong Basic auth credentials → 401
# ===========================================================================


def test_get_words_with_wrong_auth_returns_401():
    response = client.get(
        "/analyze",
        params={"text": "run"},
        auth=("admin", "wrong-password"),
    )
    assert response.status_code == 401


# ===========================================================================
# Edge case 18: input text with word, no phrasal-verb particle →
#               detected_expression=null, warnings empty
# ===========================================================================


def test_get_words_input_text_with_word_no_phrasal_verb():
    # "run" in text "I like to run every day" – starts at idx 10, length 3
    full_text = "I like to run every day"
    word = "run"
    selection_start = 10  # "run" starts at index 10
    selection_end = 13

    assert full_text[selection_start:selection_end] == word

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
    mock_doc.__len__ = MagicMock(return_value=1)
    mock_doc.__getitem__ = MagicMock(return_value=mock_token)
    mock_nlp = MagicMock(return_value=mock_doc)

    with patch("languee_nlp.routers.analyze.get_nlp", return_value=mock_nlp):
        with patch(
            "languee_nlp.routers.analyze.resolve_token_from_context"
        ) as mock_resolver:
            from languee_nlp.nlp.context_resolver import ContextResolverResult

            mock_resolver.return_value = ContextResolverResult(
                token=mock_token,
                matched_token_index=3,
                pos_source="input_text",
                confidence="high",
                detected_expression=None,
                warnings=[],
            )
            with patch("languee_nlp.nlp.word_service.getInflection", return_value=()):
                response = client.get(
                    "/analyze",
                    params={"text": word, "input_text": full_text},
                    auth=AUTH,
                )

    assert response.status_code == 200
    mock_resolver.assert_called_once_with(
        mock_nlp,
        word,
        full_text,
        selection_start,
        selection_end,
    )
    body = response.json()
    ita = body["input_text_analysis"]
    assert ita["detected_expression"] is None
    assert ita["warnings"] == []
