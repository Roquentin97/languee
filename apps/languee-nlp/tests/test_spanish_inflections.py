from languee_nlp.nlp.spanish_inflections import (
    adjective_forms,
    build_spanish_extra_forms,
    conjugate_regular,
    is_irregular_es,
    pluralize_noun,
)

# ---------------------------------------------------------------------------
# conjugate_regular
# ---------------------------------------------------------------------------


def test_conjugate_regular_ar_verb_hablar():
    assert conjugate_regular("hablar") == {
        "present_yo": "hablo",
        "present_tu": "hablas",
        "present_el": "habla",
        "present_nosotros": "hablamos",
        "present_vosotros": "habláis",
        "present_ellos": "hablan",
        "gerund": "hablando",
        "past_participle": "hablado",
    }


def test_conjugate_regular_er_verb_comer():
    assert conjugate_regular("comer") == {
        "present_yo": "como",
        "present_tu": "comes",
        "present_el": "come",
        "present_nosotros": "comemos",
        "present_vosotros": "coméis",
        "present_ellos": "comen",
        "gerund": "comiendo",
        "past_participle": "comido",
    }


def test_conjugate_regular_ir_verb_vivir():
    assert conjugate_regular("vivir") == {
        "present_yo": "vivo",
        "present_tu": "vives",
        "present_el": "vive",
        "present_nosotros": "vivimos",
        "present_vosotros": "vivís",
        "present_ellos": "viven",
        "gerund": "viviendo",
        "past_participle": "vivido",
    }


def test_conjugate_regular_non_infinitive_returns_none():
    assert conjugate_regular("casa") is None
    assert conjugate_regular("rápido") is None


# ---------------------------------------------------------------------------
# pluralize_noun
# ---------------------------------------------------------------------------


def test_pluralize_noun_unstressed_vowel_ending():
    assert pluralize_noun("casa") == "casas"


def test_pluralize_noun_consonant_ending():
    assert pluralize_noun("papel") == "papeles"


def test_pluralize_noun_z_ending():
    assert pluralize_noun("luz") == "luces"


def test_pluralize_noun_stressed_vowel_ending():
    assert pluralize_noun("sofá") == "sofás"


# ---------------------------------------------------------------------------
# adjective_forms
# ---------------------------------------------------------------------------


def test_adjective_forms_o_ending_varies_by_gender():
    assert adjective_forms("rápido") == {
        "masculine": "rápido",
        "feminine": "rápida",
        "masculine_plural": "rápidos",
        "feminine_plural": "rápidas",
    }


def test_adjective_forms_e_ending_is_invariant():
    assert adjective_forms("verde") == {
        "masculine": "verde",
        "feminine": "verde",
        "masculine_plural": "verdes",
        "feminine_plural": "verdes",
    }


def test_adjective_forms_consonant_ending_is_invariant():
    assert adjective_forms("azul") == {
        "masculine": "azul",
        "feminine": "azul",
        "masculine_plural": "azules",
        "feminine_plural": "azules",
    }


# ---------------------------------------------------------------------------
# build_spanish_extra_forms
# ---------------------------------------------------------------------------


def test_build_spanish_extra_forms_verb_delegates_to_conjugate_regular():
    result = build_spanish_extra_forms("hablar", "VERB", {})
    assert result == conjugate_regular("hablar")


def test_build_spanish_extra_forms_noun_returns_singular_and_plural():
    result = build_spanish_extra_forms("casa", "NOUN", {})
    assert result == {"singular": "casa", "plural": "casas"}


def test_build_spanish_extra_forms_adj_delegates_to_adjective_forms():
    result = build_spanish_extra_forms("rápido", "ADJ", {})
    assert result == adjective_forms("rápido")


def test_build_spanish_extra_forms_other_pos_returns_none():
    assert build_spanish_extra_forms("de", "ADP", {}) is None


# ---------------------------------------------------------------------------
# is_irregular_es
# ---------------------------------------------------------------------------


def test_is_irregular_es_tengo_is_irregular():
    morph = {"Tense": "Pres", "Person": "1", "Number": "Sing"}
    assert is_irregular_es("tengo", "tener", morph) is True


def test_is_irregular_es_hablo_is_regular():
    morph = {"Tense": "Pres", "Person": "1", "Number": "Sing"}
    assert is_irregular_es("hablo", "hablar", morph) is False


def test_is_irregular_es_missing_morph_returns_false():
    assert is_irregular_es("tengo", "tener", {}) is False


def test_is_irregular_es_non_present_tense_returns_false():
    morph = {"Tense": "Past", "Person": "1", "Number": "Sing"}
    assert is_irregular_es("tuve", "tener", morph) is False
