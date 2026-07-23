from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from languee_nlp.main import app
from languee_nlp.routers.analyze import _TOKEN_COUNT_DETAIL

client = TestClient(app)
AUTH = ("admin", "changeme")


def _make_mock_token(
    text: str = "running",
    lemma: str = "run",
    pos: str = "VERB",
    morph_dict: dict | None = None,
) -> MagicMock:
    if morph_dict is None:
        morph_dict = {}
    mock_token = MagicMock()
    mock_token.text = text
    mock_token.lemma_ = lemma
    mock_token.pos_ = pos
    mock_token.morph.to_dict.return_value = morph_dict
    return mock_token


def _make_mock_nlp(
    text: str = "running",
    lemma: str = "run",
    pos: str = "VERB",
    morph_dict: dict | None = None,
) -> MagicMock:
    mock_token = _make_mock_token(
        text=text, lemma=lemma, pos=pos, morph_dict=morph_dict
    )
    mock_doc = MagicMock()
    mock_doc.__iter__ = MagicMock(return_value=iter([mock_token]))
    mock_doc.__len__ = MagicMock(return_value=1)
    mock_doc.__getitem__ = MagicMock(return_value=mock_token)

    mock_nlp = MagicMock()
    mock_nlp.return_value = mock_doc
    return mock_nlp


def test_words_returns_analysis_for_single_word():
    mock_nlp = _make_mock_nlp(
        text="running",
        lemma="run",
        pos="VERB",
        morph_dict={"Tense": "Pres", "VerbForm": "Part"},
    )

    with patch("languee_nlp.routers.analyze.get_nlp", return_value=mock_nlp):
        with patch("languee_nlp.nlp.word_service.getInflection", return_value=()):
            response = client.get("/analyze", params={"text": "running"}, auth=AUTH)

    assert response.status_code == 200
    body = response.json()
    assert body["kind"] == "word"
    assert body["input_text"] == "running"
    assert body["is_multi_word"] is False
    assert len(body["tokens"]) == 1
    token = body["tokens"][0]
    assert token["text"] == "running"
    assert token["lemma"] == "run"
    assert token["pos"] == "VERB"
    mock_nlp.assert_called_once_with("running")


def test_words_sanitizes_input_trim_lowercase_nfc():
    mock_nlp = _make_mock_nlp(text="child", lemma="child", pos="NOUN", morph_dict={})

    with patch("languee_nlp.routers.analyze.get_nlp", return_value=mock_nlp):
        with patch("languee_nlp.nlp.word_service.getInflection", return_value=()):
            response = client.get("/analyze", params={"text": " Child "}, auth=AUTH)

    assert response.status_code == 200
    body = response.json()
    assert body["input_text"] == "child"
    mock_nlp.assert_called_once_with("child")


def test_analyze_rejects_empty_input():
    response = client.get("/analyze", params={"text": "   "}, auth=AUTH)

    assert response.status_code == 400
    assert response.json()["detail"] == _TOKEN_COUNT_DETAIL


def test_analyze_routes_multiple_words_to_expression_analysis():
    def _expr_token(text: str, lemma: str, pos: str, dep: str, i: int) -> MagicMock:
        tok = MagicMock()
        tok.text = text
        tok.lemma_ = lemma
        tok.pos_ = pos
        tok.dep_ = dep
        tok.i = i
        return tok

    tokens = [
        _expr_token("look", "look", "VERB", "ROOT", 0),
        _expr_token("up", "up", "ADP", "prt", 1),
    ]
    mock_doc = MagicMock()
    mock_doc.__len__ = MagicMock(return_value=2)
    mock_doc.__iter__ = MagicMock(side_effect=lambda: iter(tokens))
    mock_doc.__getitem__ = MagicMock(side_effect=lambda i: tokens[i])
    mock_nlp = MagicMock(return_value=mock_doc)

    with patch("languee_nlp.routers.analyze.get_nlp", return_value=mock_nlp):
        response = client.get("/analyze", params={"text": "look up"}, auth=AUTH)

    assert response.status_code == 200
    body = response.json()
    assert body["kind"] == "phrasal_verb"
    assert body["canonical"] == "look up"


def test_words_requires_basic_auth():
    response = client.get("/analyze", params={"text": "running"})

    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Basic"


def test_words_rejects_invalid_basic_auth():
    response = client.get(
        "/analyze",
        params={"text": "running"},
        auth=("admin", "wrong-password"),
    )

    assert response.status_code == 401


def test_words_irregular_verb_detected():
    mock_nlp = _make_mock_nlp(
        text="ran",
        lemma="run",
        pos="VERB",
        morph_dict={"Tense": "Past"},
    )

    with patch("languee_nlp.routers.analyze.get_nlp", return_value=mock_nlp):
        with patch("languee_nlp.nlp.word_service.getInflection", return_value=()):
            response = client.get("/analyze", params={"text": "ran"}, auth=AUTH)

    assert response.status_code == 200
    token = response.json()["tokens"][0]
    assert token["is_irregular"] is True


def test_words_regular_verb_not_irregular():
    mock_nlp = _make_mock_nlp(
        text="walked",
        lemma="walk",
        pos="VERB",
        morph_dict={"Tense": "Past"},
    )

    with patch("languee_nlp.routers.analyze.get_nlp", return_value=mock_nlp):
        with patch("languee_nlp.nlp.word_service.getInflection", return_value=()):
            response = client.get("/analyze", params={"text": "walked"}, auth=AUTH)

    assert response.status_code == 200
    token = response.json()["tokens"][0]
    assert token["is_irregular"] is False


def test_words_morphology_fields_populated():
    mock_nlp = _make_mock_nlp(
        text="ran",
        lemma="run",
        pos="VERB",
        morph_dict={"Tense": "Past", "VerbForm": "Fin", "Number": "Sing"},
    )

    with patch("languee_nlp.routers.analyze.get_nlp", return_value=mock_nlp):
        with patch("languee_nlp.nlp.word_service.getInflection", return_value=()):
            response = client.get("/analyze", params={"text": "ran"}, auth=AUTH)

    assert response.status_code == 200
    morphology = response.json()["tokens"][0]["morphology"]
    assert morphology["tense"] == "Past"
    assert morphology["verb_form"] == "Fin"
    assert morphology["number"] == "Sing"
    assert morphology["degree"] is None


def test_words_non_verb_noun_adj_has_null_verb_forms():
    mock_nlp = _make_mock_nlp(
        text="quickly",
        lemma="quickly",
        pos="ADV",
        morph_dict={},
    )

    with patch("languee_nlp.routers.analyze.get_nlp", return_value=mock_nlp):
        with patch("languee_nlp.nlp.word_service.getInflection", return_value=()):
            response = client.get("/analyze", params={"text": "quickly"}, auth=AUTH)

    assert response.status_code == 200
    forms = response.json()["tokens"][0]["forms"]
    assert forms["verb_base"] is None
    assert forms["verb_past"] is None
    assert forms["noun_singular"] is None
    assert forms["noun_plural"] is None


# --- Zero / multiple spaCy tokens ---


def test_analyze_rejects_zero_spacy_tokens():
    mock_doc = MagicMock()
    mock_doc.__len__ = MagicMock(return_value=0)
    mock_nlp = MagicMock(return_value=mock_doc)

    with patch("languee_nlp.routers.analyze.get_nlp", return_value=mock_nlp):
        response = client.get("/analyze", params={"text": "xyz"}, auth=AUTH)

    assert response.status_code == 400
    assert response.json()["detail"] == _TOKEN_COUNT_DETAIL


def test_analyze_spacy_split_of_single_whitespace_token_becomes_expression():
    """A single whitespace-delimited token that spaCy splits into several
    tokens (e.g. hyphenations, contractions) is analyzed as an expression
    instead of being rejected."""

    def _expr_token(text: str, lemma: str, pos: str, dep: str, i: int) -> MagicMock:
        tok = MagicMock()
        tok.text = text
        tok.lemma_ = lemma
        tok.pos_ = pos
        tok.dep_ = dep
        tok.i = i
        return tok

    tokens = [
        _expr_token("state", "state", "NOUN", "ROOT", 0),
        _expr_token("-", "-", "PUNCT", "punct", 1),
        _expr_token("of", "of", "ADP", "prep", 2),
    ]
    mock_doc = MagicMock()
    mock_doc.__len__ = MagicMock(return_value=3)
    mock_doc.__iter__ = MagicMock(side_effect=lambda: iter(tokens))
    mock_doc.__getitem__ = MagicMock(side_effect=lambda i: tokens[i])
    mock_nlp = MagicMock(return_value=mock_doc)

    with patch("languee_nlp.routers.analyze.get_nlp", return_value=mock_nlp):
        response = client.get("/analyze", params={"text": "state-of"}, auth=AUTH)

    assert response.status_code == 200
    assert response.json()["kind"] == "expression"


# --- Verb past-participle irregularity ---


def test_words_irregular_past_participle_verb():
    mock_nlp = _make_mock_nlp(
        text="broken",
        lemma="break",
        pos="VERB",
        morph_dict={"VerbForm": "Part"},
    )

    with patch("languee_nlp.routers.analyze.get_nlp", return_value=mock_nlp):
        with patch("languee_nlp.nlp.word_service.getInflection", return_value=()):
            response = client.get("/analyze", params={"text": "broken"}, auth=AUTH)

    assert response.status_code == 200
    assert response.json()["tokens"][0]["is_irregular"] is True


# --- Noun regularity ---


def test_words_regular_noun_plural():
    mock_nlp = _make_mock_nlp(
        text="cats",
        lemma="cat",
        pos="NOUN",
        morph_dict={"Number": "Plur"},
    )

    with patch("languee_nlp.routers.analyze.get_nlp", return_value=mock_nlp):
        with patch("languee_nlp.nlp.word_service.getInflection", return_value=()):
            response = client.get("/analyze", params={"text": "cats"}, auth=AUTH)

    assert response.status_code == 200
    assert response.json()["tokens"][0]["is_irregular"] is False


def test_words_irregular_noun_plural():
    mock_nlp = _make_mock_nlp(
        text="mice",
        lemma="mouse",
        pos="NOUN",
        morph_dict={"Number": "Plur"},
    )

    with patch("languee_nlp.routers.analyze.get_nlp", return_value=mock_nlp):
        with patch("languee_nlp.nlp.word_service.getInflection", return_value=()):
            response = client.get("/analyze", params={"text": "mice"}, auth=AUTH)

    assert response.status_code == 200
    assert response.json()["tokens"][0]["is_irregular"] is True


def test_words_noun_es_plural_not_irregular():
    mock_nlp = _make_mock_nlp(
        text="boxes",
        lemma="box",
        pos="NOUN",
        morph_dict={"Number": "Plur"},
    )

    with patch("languee_nlp.routers.analyze.get_nlp", return_value=mock_nlp):
        with patch("languee_nlp.nlp.word_service.getInflection", return_value=()):
            response = client.get("/analyze", params={"text": "boxes"}, auth=AUTH)

    assert response.status_code == 200
    assert response.json()["tokens"][0]["is_irregular"] is False


def test_words_noun_y_ies_plural_not_irregular():
    mock_nlp = _make_mock_nlp(
        text="babies",
        lemma="baby",
        pos="NOUN",
        morph_dict={"Number": "Plur"},
    )

    with patch("languee_nlp.routers.analyze.get_nlp", return_value=mock_nlp):
        with patch("languee_nlp.nlp.word_service.getInflection", return_value=()):
            response = client.get("/analyze", params={"text": "babies"}, auth=AUTH)

    assert response.status_code == 200
    assert response.json()["tokens"][0]["is_irregular"] is False


# --- ADJ regularity ---


def test_words_adj_regular_comparative_not_irregular():
    mock_nlp = _make_mock_nlp(
        text="taller",
        lemma="tall",
        pos="ADJ",
        morph_dict={"Degree": "Cmp"},
    )

    with patch("languee_nlp.routers.analyze.get_nlp", return_value=mock_nlp):
        with patch("languee_nlp.nlp.word_service.getInflection", return_value=()):
            response = client.get("/analyze", params={"text": "taller"}, auth=AUTH)

    assert response.status_code == 200
    assert response.json()["tokens"][0]["is_irregular"] is False


def test_words_adj_irregular_comparative():
    mock_nlp = _make_mock_nlp(
        text="better",
        lemma="good",
        pos="ADJ",
        morph_dict={"Degree": "Cmp"},
    )

    with patch("languee_nlp.routers.analyze.get_nlp", return_value=mock_nlp):
        with patch("languee_nlp.nlp.word_service.getInflection", return_value=()):
            response = client.get("/analyze", params={"text": "better"}, auth=AUTH)

    assert response.status_code == 200
    assert response.json()["tokens"][0]["is_irregular"] is True


# --- ADV irregularity ---


def test_words_adv_irregular_superlative():
    mock_nlp = _make_mock_nlp(
        text="worst",
        lemma="badly",
        pos="ADV",
        morph_dict={"Degree": "Sup"},
    )

    with patch("languee_nlp.routers.analyze.get_nlp", return_value=mock_nlp):
        with patch("languee_nlp.nlp.word_service.getInflection", return_value=()):
            response = client.get("/analyze", params={"text": "worst"}, auth=AUTH)

    assert response.status_code == 200
    assert response.json()["tokens"][0]["is_irregular"] is True


# --- POS other than VERB/NOUN/ADJ/ADV ---


def test_words_other_pos_all_forms_null_and_not_irregular():
    mock_nlp = _make_mock_nlp(
        text="the",
        lemma="the",
        pos="DET",
        morph_dict={},
    )

    with patch("languee_nlp.routers.analyze.get_nlp", return_value=mock_nlp):
        with patch("languee_nlp.nlp.word_service.getInflection", return_value=()):
            response = client.get("/analyze", params={"text": "the"}, auth=AUTH)

    assert response.status_code == 200
    token = response.json()["tokens"][0]
    assert token["is_irregular"] is False
    forms = token["forms"]
    for field in (
        "verb_base",
        "verb_past",
        "verb_present_3sg",
        "verb_present_non_3sg",
        "verb_gerund_participle",
        "verb_past_participle",
        "noun_singular",
        "noun_plural",
        "adj_positive",
        "adj_comparative",
        "adj_superlative",
    ):
        assert forms[field] is None, f"expected {field} to be null for DET"


# --- getInflection returns empty tuple → null ---


def test_words_get_inflection_empty_tuple_produces_null_forms():
    mock_nlp = _make_mock_nlp(
        text="run",
        lemma="run",
        pos="VERB",
        morph_dict={},
    )

    with patch("languee_nlp.routers.analyze.get_nlp", return_value=mock_nlp):
        with patch(
            "languee_nlp.nlp.word_service.getInflection", return_value=()
        ) as mock_infl:
            response = client.get("/analyze", params={"text": "run"}, auth=AUTH)
            assert mock_infl.called

    assert response.status_code == 200
    forms = response.json()["tokens"][0]["forms"]
    assert forms["verb_base"] is None
    assert forms["verb_past"] is None
    assert forms["verb_present_3sg"] is None
    assert forms["verb_present_non_3sg"] is None
    assert forms["verb_gerund_participle"] is None
    assert forms["verb_past_participle"] is None


# --- Morphology dict missing all keys → all null ---


def test_words_morphology_all_null_when_morph_dict_empty():
    mock_nlp = _make_mock_nlp(
        text="run",
        lemma="run",
        pos="VERB",
        morph_dict={},
    )

    with patch("languee_nlp.routers.analyze.get_nlp", return_value=mock_nlp):
        with patch("languee_nlp.nlp.word_service.getInflection", return_value=()):
            response = client.get("/analyze", params={"text": "run"}, auth=AUTH)

    assert response.status_code == 200
    morph = response.json()["tokens"][0]["morphology"]
    assert morph["tense"] is None
    assert morph["verb_form"] is None
    assert morph["number"] is None
    assert morph["degree"] is None


# --- Unicode NFC normalization ---


def test_words_nfc_unicode_normalization():
    import unicodedata

    # Compose "café" (NFD: e + combining acute) → NFC "café"
    nfd_word = "café"
    nfc_word = unicodedata.normalize("NFC", nfd_word)
    assert nfd_word != nfc_word

    mock_nlp = _make_mock_nlp(text=nfc_word, lemma=nfc_word, pos="NOUN", morph_dict={})

    with patch("languee_nlp.routers.analyze.get_nlp", return_value=mock_nlp):
        with patch("languee_nlp.nlp.word_service.getInflection", return_value=()):
            response = client.get("/analyze", params={"text": nfd_word}, auth=AUTH)

    assert response.status_code == 200
    assert response.json()["input_text"] == nfc_word
    mock_nlp.assert_called_once_with(nfc_word)


# --- ADV forms use adj_ fields only ---


def test_words_adv_populates_adj_fields_not_verb_or_noun():
    mock_nlp = _make_mock_nlp(
        text="faster",
        lemma="fast",
        pos="ADV",
        morph_dict={"Degree": "Cmp"},
    )

    def fake_inflection(lemma: str, tag: str) -> tuple:
        mapping = {
            "JJ": ("fast",),
            "JJR": ("faster",),
            "JJS": ("fastest",),
        }
        return mapping.get(tag, ())

    with patch("languee_nlp.routers.analyze.get_nlp", return_value=mock_nlp):
        with patch(
            "languee_nlp.nlp.word_service.getInflection", side_effect=fake_inflection
        ):
            response = client.get("/analyze", params={"text": "faster"}, auth=AUTH)

    assert response.status_code == 200
    forms = response.json()["tokens"][0]["forms"]
    assert forms["verb_base"] is None
    assert forms["noun_singular"] is None
    assert forms["adj_positive"] == "fast"
    assert forms["adj_comparative"] == "faster"
    assert forms["adj_superlative"] == "fastest"


# --- Missing query param → 422 ---


def test_words_missing_word_param_returns_422():
    response = client.get("/analyze", auth=AUTH)

    assert response.status_code == 422


# --- language parameter ---


def test_words_default_language_is_en():
    mock_nlp = _make_mock_nlp(
        text="running",
        lemma="run",
        pos="VERB",
        morph_dict={"Tense": "Pres", "VerbForm": "Part"},
    )

    with patch("languee_nlp.routers.analyze.get_nlp", return_value=mock_nlp):
        with patch("languee_nlp.nlp.word_service.getInflection", return_value=()):
            response = client.get("/analyze", params={"text": "running"}, auth=AUTH)

    assert response.status_code == 200
    body = response.json()
    assert body["language"] == "en"


def test_words_unsupported_language_returns_400():
    response = client.get(
        "/analyze",
        params={"text": "hablo", "language": "fr"},
        auth=AUTH,
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "LANGUAGE_NOT_SUPPORTED"
