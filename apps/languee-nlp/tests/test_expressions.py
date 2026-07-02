from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from languee_nlp.main import app

client = TestClient(app)
AUTH = ("admin", "changeme")


def _patch_nlp(mock_nlp: MagicMock):
    return patch("languee_nlp.routers.expressions.get_nlp", return_value=mock_nlp)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_mock_token(
    text: str,
    lemma: str,
    pos: str,
    dep_: str = "",
    idx: int = 0,
    i: int = 0,
) -> MagicMock:
    tok = MagicMock()
    tok.text = text
    tok.lemma_ = lemma
    tok.pos_ = pos
    tok.dep_ = dep_
    tok.idx = idx
    tok.i = i
    return tok


def _make_mock_doc(tokens: list[MagicMock]) -> MagicMock:
    doc = MagicMock()
    doc.__len__ = MagicMock(return_value=len(tokens))
    doc.__iter__ = MagicMock(side_effect=lambda: iter(tokens))
    doc.__getitem__ = MagicMock(side_effect=lambda i: tokens[i])
    return doc


def _make_routed_nlp(routes: dict[str, MagicMock]) -> MagicMock:
    """A mock nlp callable that returns a specific doc per input text."""

    def _route(text: str) -> MagicMock:
        return routes[text]

    return MagicMock(side_effect=_route)


def _tokens_with_offsets(
    text: str, specs: list[tuple[str, str, str, str]]
) -> list[MagicMock]:
    """Build mock tokens for `text`, deriving idx from str.find for each token text.

    specs: list of (token_text, lemma, pos, dep_)
    """
    tokens = []
    search_from = 0
    for i, (tok_text, lemma, pos, dep_) in enumerate(specs):
        idx = text.index(tok_text, search_from)
        tokens.append(_make_mock_token(tok_text, lemma, pos, dep_, idx=idx, i=i))
        search_from = idx + len(tok_text)
    return tokens


# ---------------------------------------------------------------------------
# Canonicalization / kind classification
# ---------------------------------------------------------------------------


def test_expressions_phrasal_verb_canonicalizes_inflected_head():
    expr_tokens = [
        _make_mock_token("ran", "run", "VERB", dep_="ROOT", i=0),
        _make_mock_token("into", "into", "ADP", dep_="prt", i=1),
    ]
    mock_nlp = _make_routed_nlp({"ran into": _make_mock_doc(expr_tokens)})

    with _patch_nlp(mock_nlp):
        response = client.get(
            "/expressions", params={"expression": "ran into"}, auth=AUTH
        )

    assert response.status_code == 200
    body = response.json()
    assert body["input_text"] == "ran into"
    assert body["kind"] == "phrasal_verb"
    assert body["head_lemma"] == "run"
    assert body["canonical"] == "run into"
    assert body["tokens"] == [
        {"text": "ran", "lemma": "run", "pos": "VERB"},
        {"text": "into", "lemma": "into", "pos": "ADP"},
    ]
    assert "context_match" not in body


def test_expressions_idiom_kept_verbatim_not_lemma_joined():
    expr_tokens = [
        _make_mock_token("spill", "spill", "VERB", dep_="ROOT", i=0),
        _make_mock_token("the", "the", "DET", dep_="det", i=1),
        _make_mock_token("beans", "bean", "NOUN", dep_="dobj", i=2),
    ]
    mock_nlp = _make_routed_nlp({"spill the beans": _make_mock_doc(expr_tokens)})

    with _patch_nlp(mock_nlp):
        response = client.get(
            "/expressions", params={"expression": "spill the beans"}, auth=AUTH
        )

    assert response.status_code == 200
    body = response.json()
    assert body["kind"] == "expression"
    assert body["head_lemma"] == "spill"
    assert body["canonical"] == "spill the beans"


# ---------------------------------------------------------------------------
# Token count validation
# ---------------------------------------------------------------------------


def test_expressions_rejects_single_token():
    mock_nlp = _make_routed_nlp(
        {"hello": _make_mock_doc([_make_mock_token("hello", "hello", "INTJ")])}
    )

    with _patch_nlp(mock_nlp):
        response = client.get("/expressions", params={"expression": "hello"}, auth=AUTH)

    assert response.status_code == 400
    assert response.json()["detail"] == "expression must contain between 2 and 6 tokens"


def test_expressions_rejects_seven_tokens():
    text = "one two three four five six seven"
    tokens = [_make_mock_token(w, w, "NOUN", i=i) for i, w in enumerate(text.split())]
    mock_nlp = _make_routed_nlp({text: _make_mock_doc(tokens)})

    with _patch_nlp(mock_nlp):
        response = client.get("/expressions", params={"expression": text}, auth=AUTH)

    assert response.status_code == 400
    assert response.json()["detail"] == "expression must contain between 2 and 6 tokens"


def test_expressions_rejects_blank_expression():
    mock_nlp = _make_routed_nlp({"": _make_mock_doc([])})

    with _patch_nlp(mock_nlp):
        response = client.get("/expressions", params={"expression": "   "}, auth=AUTH)

    assert response.status_code == 400
    assert response.json()["detail"] == "expression must contain between 2 and 6 tokens"


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------


def test_expressions_requires_basic_auth():
    response = client.get("/expressions", params={"expression": "give up"})

    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Basic"


# ---------------------------------------------------------------------------
# Context match: exact match
# ---------------------------------------------------------------------------


def test_expressions_exact_context_match_with_offsets():
    expr_tokens = [
        _make_mock_token("give", "give", "VERB", dep_="ROOT", i=0),
        _make_mock_token("up", "up", "ADP", dep_="prt", i=1),
    ]
    input_text = "Please don't Give Up now."
    mock_nlp = _make_routed_nlp({"give up": _make_mock_doc(expr_tokens)})

    with _patch_nlp(mock_nlp):
        response = client.get(
            "/expressions",
            params={"expression": "give up", "input_text": input_text},
            auth=AUTH,
        )

    assert response.status_code == 200
    body = response.json()
    match = body["context_match"]
    assert match["found"] is True
    assert match["confidence"] == "high"
    assert match["matched_text"] == "Give Up"
    start, end = match["start"], match["end"]
    assert input_text[start:end] == "Give Up"


# ---------------------------------------------------------------------------
# Context match: lemma-based, inflected head -> low confidence
# ---------------------------------------------------------------------------


def test_expressions_inflected_head_context_match_is_low_confidence():
    expr_tokens = [
        _make_mock_token("run", "run", "VERB", dep_="ROOT", i=0),
        _make_mock_token("into", "into", "ADP", dep_="prt", i=1),
    ]
    input_text = "She ran into her old friend yesterday."
    context_tokens = _tokens_with_offsets(
        input_text,
        [
            ("She", "she", "PRON", ""),
            ("ran", "run", "VERB", "ROOT"),
            ("into", "into", "ADP", "prt"),
            ("her", "her", "PRON", ""),
            ("old", "old", "ADJ", ""),
            ("friend", "friend", "NOUN", ""),
            ("yesterday", "yesterday", "NOUN", ""),
        ],
    )
    mock_nlp = _make_routed_nlp(
        {
            "run into": _make_mock_doc(expr_tokens),
            input_text: _make_mock_doc(context_tokens),
        }
    )

    with _patch_nlp(mock_nlp):
        response = client.get(
            "/expressions",
            params={"expression": "run into", "input_text": input_text},
            auth=AUTH,
        )

    assert response.status_code == 200
    match = response.json()["context_match"]
    assert match["found"] is True
    assert match["confidence"] == "low"
    assert match["matched_text"] == "ran into"


# ---------------------------------------------------------------------------
# Context match: separated phrasal verb within gap window
# ---------------------------------------------------------------------------


def test_expressions_separated_phrasal_verb_within_gap_window():
    expr_tokens = [
        _make_mock_token("give", "give", "VERB", dep_="ROOT", i=0),
        _make_mock_token("up", "up", "ADP", dep_="prt", i=1),
    ]
    input_text = "He gave it all up yesterday."
    context_tokens = _tokens_with_offsets(
        input_text,
        [
            ("He", "he", "PRON", ""),
            ("gave", "give", "VERB", "ROOT"),
            ("it", "it", "PRON", ""),
            ("all", "all", "DET", ""),
            ("up", "up", "ADP", "prt"),
            ("yesterday", "yesterday", "NOUN", ""),
        ],
    )
    mock_nlp = _make_routed_nlp(
        {
            "give up": _make_mock_doc(expr_tokens),
            input_text: _make_mock_doc(context_tokens),
        }
    )

    with _patch_nlp(mock_nlp):
        response = client.get(
            "/expressions",
            params={"expression": "give up", "input_text": input_text},
            auth=AUTH,
        )

    assert response.status_code == 200
    match = response.json()["context_match"]
    assert match["found"] is True
    assert match["confidence"] == "low"
    assert match["matched_text"] == "gave it all up"


def test_expressions_gap_window_exceeded_returns_not_found():
    expr_tokens = [
        _make_mock_token("give", "give", "VERB", dep_="ROOT", i=0),
        _make_mock_token("up", "up", "ADP", dep_="prt", i=1),
    ]
    input_text = "He gave it all the way up yesterday."
    context_tokens = _tokens_with_offsets(
        input_text,
        [
            ("He", "he", "PRON", ""),
            ("gave", "give", "VERB", "ROOT"),
            ("it", "it", "PRON", ""),
            ("all", "all", "DET", ""),
            ("the", "the", "DET", ""),
            ("way", "way", "NOUN", ""),
            ("up", "up", "ADP", "prt"),
            ("yesterday", "yesterday", "NOUN", ""),
        ],
    )
    mock_nlp = _make_routed_nlp(
        {
            "give up": _make_mock_doc(expr_tokens),
            input_text: _make_mock_doc(context_tokens),
        }
    )

    with _patch_nlp(mock_nlp):
        response = client.get(
            "/expressions",
            params={"expression": "give up", "input_text": input_text},
            auth=AUTH,
        )

    assert response.status_code == 200
    match = response.json()["context_match"]
    assert match["found"] is False
    assert match["matched_text"] is None
    assert match["start"] is None
    assert match["end"] is None
    assert match["confidence"] is None


# ---------------------------------------------------------------------------
# No input_text -> context_match omitted entirely
# ---------------------------------------------------------------------------


def test_expressions_no_input_text_omits_context_match():
    expr_tokens = [
        _make_mock_token("give", "give", "VERB", dep_="ROOT", i=0),
        _make_mock_token("up", "up", "ADP", dep_="prt", i=1),
    ]
    mock_nlp = _make_routed_nlp({"give up": _make_mock_doc(expr_tokens)})

    with _patch_nlp(mock_nlp):
        response = client.get(
            "/expressions", params={"expression": "give up"}, auth=AUTH
        )

    assert response.status_code == 200
    assert "context_match" not in response.json()


# ---------------------------------------------------------------------------
# Classification fallback paths
# ---------------------------------------------------------------------------


def test_expressions_pos_fallback_classifies_phrasal_verb_without_prt_dep():
    expr_tokens = [
        _make_mock_token("sort", "sort", "VERB", dep_="ROOT", i=0),
        _make_mock_token("out", "out", "PART", dep_="advmod", i=1),
    ]
    mock_nlp = _make_routed_nlp({"sort out": _make_mock_doc(expr_tokens)})

    with _patch_nlp(mock_nlp):
        response = client.get(
            "/expressions", params={"expression": "sort out"}, auth=AUTH
        )

    assert response.status_code == 200
    body = response.json()
    assert body["kind"] == "phrasal_verb"
    assert body["canonical"] == "sort out"


def test_expressions_head_lemma_falls_back_to_first_token_when_no_verb():
    expr_tokens = [
        _make_mock_token("over", "over", "ADP", dep_="ROOT", i=0),
        _make_mock_token("the", "the", "DET", dep_="det", i=1),
        _make_mock_token("top", "top", "NOUN", dep_="pobj", i=2),
    ]
    mock_nlp = _make_routed_nlp({"over the top": _make_mock_doc(expr_tokens)})

    with _patch_nlp(mock_nlp):
        response = client.get(
            "/expressions", params={"expression": "over the top"}, auth=AUTH
        )

    assert response.status_code == 200
    body = response.json()
    assert body["kind"] == "expression"
    assert body["head_lemma"] == "over"
    assert body["canonical"] == "over the top"


# ---------------------------------------------------------------------------
# Context match: lemma matching applies to non-head tokens too
# ---------------------------------------------------------------------------


def test_expressions_context_match_uses_lemma_for_inflected_non_head_token():
    expr_tokens = [
        _make_mock_token("keep", "keep", "VERB", dep_="ROOT", i=0),
        _make_mock_token("forms", "form", "NOUN", dep_="dobj", i=1),
    ]
    input_text = "He kept the form yesterday."
    context_tokens = _tokens_with_offsets(
        input_text,
        [
            ("He", "he", "PRON", ""),
            ("kept", "keep", "VERB", "ROOT"),
            ("the", "the", "DET", ""),
            ("form", "form", "NOUN", "dobj"),
            ("yesterday", "yesterday", "NOUN", ""),
        ],
    )
    mock_nlp = _make_routed_nlp(
        {
            "keep forms": _make_mock_doc(expr_tokens),
            input_text: _make_mock_doc(context_tokens),
        }
    )

    with _patch_nlp(mock_nlp):
        response = client.get(
            "/expressions",
            params={"expression": "keep forms", "input_text": input_text},
            auth=AUTH,
        )

    assert response.status_code == 200
    match = response.json()["context_match"]
    assert match["found"] is True
    assert match["confidence"] == "low"
    assert match["matched_text"] == "kept the form"
