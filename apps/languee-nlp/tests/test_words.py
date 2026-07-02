from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from languee_nlp.main import app

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

    with patch("languee_nlp.routers.words.get_nlp", return_value=mock_nlp):
        with patch("languee_nlp.nlp.word_service.getInflection", return_value=()):
            response = client.get("/words", params={"word": "running"}, auth=AUTH)

    assert response.status_code == 200
    body = response.json()
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

    with patch("languee_nlp.routers.words.get_nlp", return_value=mock_nlp):
        with patch("languee_nlp.nlp.word_service.getInflection", return_value=()):
            response = client.get("/words", params={"word": " Child "}, auth=AUTH)

    assert response.status_code == 200
    body = response.json()
    assert body["input_text"] == "child"
    mock_nlp.assert_called_once_with("child")


def test_words_rejects_empty_input():
    response = client.get("/words", params={"word": "   "}, auth=AUTH)

    assert response.status_code == 400
    assert (
        response.json()["detail"]
        == "word must be a single word; multi-word input is not supported"
    )


def test_words_rejects_multiple_words():
    response = client.get("/words", params={"word": "look up"}, auth=AUTH)

    assert response.status_code == 400


def test_words_requires_basic_auth():
    response = client.get("/words", params={"word": "running"})

    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Basic"


def test_words_rejects_invalid_basic_auth():
    response = client.get(
        "/words",
        params={"word": "running"},
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

    with patch("languee_nlp.routers.words.get_nlp", return_value=mock_nlp):
        with patch("languee_nlp.nlp.word_service.getInflection", return_value=()):
            response = client.get("/words", params={"word": "ran"}, auth=AUTH)

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

    with patch("languee_nlp.routers.words.get_nlp", return_value=mock_nlp):
        with patch("languee_nlp.nlp.word_service.getInflection", return_value=()):
            response = client.get("/words", params={"word": "walked"}, auth=AUTH)

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

    with patch("languee_nlp.routers.words.get_nlp", return_value=mock_nlp):
        with patch("languee_nlp.nlp.word_service.getInflection", return_value=()):
            response = client.get("/words", params={"word": "ran"}, auth=AUTH)

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

    with patch("languee_nlp.routers.words.get_nlp", return_value=mock_nlp):
        with patch("languee_nlp.nlp.word_service.getInflection", return_value=()):
            response = client.get("/words", params={"word": "quickly"}, auth=AUTH)

    assert response.status_code == 200
    forms = response.json()["tokens"][0]["forms"]
    assert forms["verb_base"] is None
    assert forms["verb_past"] is None
    assert forms["noun_singular"] is None
    assert forms["noun_plural"] is None


# --- Zero / multiple spaCy tokens ---


def test_words_rejects_zero_spacy_tokens():
    mock_doc = MagicMock()
    mock_doc.__len__ = MagicMock(return_value=0)
    mock_nlp = MagicMock(return_value=mock_doc)

    with patch("languee_nlp.routers.words.get_nlp", return_value=mock_nlp):
        response = client.get("/words", params={"word": "xyz"}, auth=AUTH)

    assert response.status_code == 400
    assert (
        response.json()["detail"]
        == "word must be a single word; multi-word input is not supported"
    )


def test_words_rejects_multiple_spacy_tokens():
    mock_doc = MagicMock()
    mock_doc.__len__ = MagicMock(return_value=2)
    mock_nlp = MagicMock(return_value=mock_doc)

    with patch("languee_nlp.routers.words.get_nlp", return_value=mock_nlp):
        response = client.get("/words", params={"word": "lookup"}, auth=AUTH)

    assert response.status_code == 400


# --- Verb past-participle irregularity ---


def test_words_irregular_past_participle_verb():
    mock_nlp = _make_mock_nlp(
        text="broken",
        lemma="break",
        pos="VERB",
        morph_dict={"VerbForm": "Part"},
    )

    with patch("languee_nlp.routers.words.get_nlp", return_value=mock_nlp):
        with patch("languee_nlp.nlp.word_service.getInflection", return_value=()):
            response = client.get("/words", params={"word": "broken"}, auth=AUTH)

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

    with patch("languee_nlp.routers.words.get_nlp", return_value=mock_nlp):
        with patch("languee_nlp.nlp.word_service.getInflection", return_value=()):
            response = client.get("/words", params={"word": "cats"}, auth=AUTH)

    assert response.status_code == 200
    assert response.json()["tokens"][0]["is_irregular"] is False


def test_words_irregular_noun_plural():
    mock_nlp = _make_mock_nlp(
        text="mice",
        lemma="mouse",
        pos="NOUN",
        morph_dict={"Number": "Plur"},
    )

    with patch("languee_nlp.routers.words.get_nlp", return_value=mock_nlp):
        with patch("languee_nlp.nlp.word_service.getInflection", return_value=()):
            response = client.get("/words", params={"word": "mice"}, auth=AUTH)

    assert response.status_code == 200
    assert response.json()["tokens"][0]["is_irregular"] is True


def test_words_noun_es_plural_not_irregular():
    mock_nlp = _make_mock_nlp(
        text="boxes",
        lemma="box",
        pos="NOUN",
        morph_dict={"Number": "Plur"},
    )

    with patch("languee_nlp.routers.words.get_nlp", return_value=mock_nlp):
        with patch("languee_nlp.nlp.word_service.getInflection", return_value=()):
            response = client.get("/words", params={"word": "boxes"}, auth=AUTH)

    assert response.status_code == 200
    assert response.json()["tokens"][0]["is_irregular"] is False


def test_words_noun_y_ies_plural_not_irregular():
    mock_nlp = _make_mock_nlp(
        text="babies",
        lemma="baby",
        pos="NOUN",
        morph_dict={"Number": "Plur"},
    )

    with patch("languee_nlp.routers.words.get_nlp", return_value=mock_nlp):
        with patch("languee_nlp.nlp.word_service.getInflection", return_value=()):
            response = client.get("/words", params={"word": "babies"}, auth=AUTH)

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

    with patch("languee_nlp.routers.words.get_nlp", return_value=mock_nlp):
        with patch("languee_nlp.nlp.word_service.getInflection", return_value=()):
            response = client.get("/words", params={"word": "taller"}, auth=AUTH)

    assert response.status_code == 200
    assert response.json()["tokens"][0]["is_irregular"] is False


def test_words_adj_irregular_comparative():
    mock_nlp = _make_mock_nlp(
        text="better",
        lemma="good",
        pos="ADJ",
        morph_dict={"Degree": "Cmp"},
    )

    with patch("languee_nlp.routers.words.get_nlp", return_value=mock_nlp):
        with patch("languee_nlp.nlp.word_service.getInflection", return_value=()):
            response = client.get("/words", params={"word": "better"}, auth=AUTH)

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

    with patch("languee_nlp.routers.words.get_nlp", return_value=mock_nlp):
        with patch("languee_nlp.nlp.word_service.getInflection", return_value=()):
            response = client.get("/words", params={"word": "worst"}, auth=AUTH)

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

    with patch("languee_nlp.routers.words.get_nlp", return_value=mock_nlp):
        with patch("languee_nlp.nlp.word_service.getInflection", return_value=()):
            response = client.get("/words", params={"word": "the"}, auth=AUTH)

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

    with patch("languee_nlp.routers.words.get_nlp", return_value=mock_nlp):
        with patch(
            "languee_nlp.nlp.word_service.getInflection", return_value=()
        ) as mock_infl:
            response = client.get("/words", params={"word": "run"}, auth=AUTH)
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

    with patch("languee_nlp.routers.words.get_nlp", return_value=mock_nlp):
        with patch("languee_nlp.nlp.word_service.getInflection", return_value=()):
            response = client.get("/words", params={"word": "run"}, auth=AUTH)

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

    with patch("languee_nlp.routers.words.get_nlp", return_value=mock_nlp):
        with patch("languee_nlp.nlp.word_service.getInflection", return_value=()):
            response = client.get("/words", params={"word": nfd_word}, auth=AUTH)

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

    with patch("languee_nlp.routers.words.get_nlp", return_value=mock_nlp):
        with patch(
            "languee_nlp.nlp.word_service.getInflection", side_effect=fake_inflection
        ):
            response = client.get("/words", params={"word": "faster"}, auth=AUTH)

    assert response.status_code == 200
    forms = response.json()["tokens"][0]["forms"]
    assert forms["verb_base"] is None
    assert forms["noun_singular"] is None
    assert forms["adj_positive"] == "fast"
    assert forms["adj_comparative"] == "faster"
    assert forms["adj_superlative"] == "fastest"


# --- Missing query param → 422 ---


def test_words_missing_word_param_returns_422():
    response = client.get("/words", auth=AUTH)

    assert response.status_code == 422


# --- language parameter ---


def test_words_default_language_is_en_and_omits_extra_forms():
    mock_nlp = _make_mock_nlp(
        text="running",
        lemma="run",
        pos="VERB",
        morph_dict={"Tense": "Pres", "VerbForm": "Part"},
    )

    with patch("languee_nlp.routers.words.get_nlp", return_value=mock_nlp):
        with patch("languee_nlp.nlp.word_service.getInflection", return_value=()):
            response = client.get("/words", params={"word": "running"}, auth=AUTH)

    assert response.status_code == 200
    body = response.json()
    assert body["language"] == "en"
    assert "extra_forms" not in body["tokens"][0]


def test_words_spanish_language_echoes_and_returns_extra_forms():
    mock_nlp = _make_mock_nlp(
        text="hablo",
        lemma="hablar",
        pos="VERB",
        morph_dict={"Tense": "Pres", "Person": "1", "Number": "Sing"},
    )

    with patch("languee_nlp.routers.words.get_nlp", return_value=mock_nlp):
        response = client.get(
            "/words",
            params={"word": "hablo", "language": "es"},
            auth=AUTH,
        )

    assert response.status_code == 200
    body = response.json()
    assert body["language"] == "es"
    token = body["tokens"][0]
    assert token["is_irregular"] is False
    assert token["forms"]["verb_base"] is None
    assert token["forms"]["noun_singular"] is None
    assert token["extra_forms"]["present_yo"] == "hablo"
    assert token["extra_forms"]["gerund"] == "hablando"


def test_words_unsupported_language_returns_400():
    response = client.get(
        "/words",
        params={"word": "hablo", "language": "fr"},
        auth=AUTH,
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "LANGUAGE_NOT_SUPPORTED"
