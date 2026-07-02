"""Pure string-based Spanish inflection helpers.

spaCy's Spanish pipeline provides lemma/POS/morph but no conjugation or
declension tables. These functions generate regular Spanish forms from a
lemma using rule-based suffix substitution. They take only primitive inputs
(strings/dicts) so they are testable without loading any spaCy model.
"""

_UNSTRESSED_VOWELS = "aeiou"
_STRESSED_VOWELS = "áéíóú"


def conjugate_regular(lemma: str) -> dict[str, str] | None:
    """Conjugate a regular -ar/-er/-ir infinitive into present tense, gerund,
    and past participle forms. Returns None if `lemma` is not a recognized
    infinitive ending.
    """
    if lemma.endswith("ar"):
        stem = lemma[:-2]
        return {
            "present_yo": stem + "o",
            "present_tu": stem + "as",
            "present_el": stem + "a",
            "present_nosotros": stem + "amos",
            "present_vosotros": stem + "áis",
            "present_ellos": stem + "an",
            "gerund": stem + "ando",
            "past_participle": stem + "ado",
        }
    if lemma.endswith("er"):
        stem = lemma[:-2]
        return {
            "present_yo": stem + "o",
            "present_tu": stem + "es",
            "present_el": stem + "e",
            "present_nosotros": stem + "emos",
            "present_vosotros": stem + "éis",
            "present_ellos": stem + "en",
            "gerund": stem + "iendo",
            "past_participle": stem + "ido",
        }
    if lemma.endswith("ir"):
        stem = lemma[:-2]
        return {
            "present_yo": stem + "o",
            "present_tu": stem + "es",
            "present_el": stem + "e",
            "present_nosotros": stem + "imos",
            "present_vosotros": stem + "ís",
            "present_ellos": stem + "en",
            "gerund": stem + "iendo",
            "past_participle": stem + "ido",
        }
    return None


def pluralize_noun(singular: str) -> str:
    """Pluralize a Spanish noun. Approximation of the standard rules:

    - -z ending -> replace with -ces
    - any other vowel ending (stressed or unstressed) -> + s
      (e.g. "casa" -> "casas", "sofá" -> "sofás"; real Spanish allows -es
      for some stressed í/ú endings, which this approximation does not
      distinguish)
    - consonant ending -> + es
    """
    if singular.endswith("z"):
        return singular[:-1] + "ces"
    if singular and singular[-1] in _UNSTRESSED_VOWELS + _STRESSED_VOWELS:
        return singular + "s"
    return singular + "es"


def adjective_forms(lemma: str) -> dict[str, str]:
    """Return masculine/feminine singular and plural forms for a Spanish
    adjective lemma. Adjectives ending in -o vary by gender; adjectives
    ending in -e or a consonant are invariant for gender.
    """
    if lemma.endswith("o"):
        stem = lemma[:-1]
        masculine = lemma
        feminine = stem + "a"
        return {
            "masculine": masculine,
            "feminine": feminine,
            "masculine_plural": pluralize_noun(masculine),
            "feminine_plural": pluralize_noun(feminine),
        }
    return {
        "masculine": lemma,
        "feminine": lemma,
        "masculine_plural": pluralize_noun(lemma),
        "feminine_plural": pluralize_noun(lemma),
    }


def build_spanish_extra_forms(
    lemma: str, pos: str, morph: dict[str, str]
) -> dict[str, str] | None:
    """Build the `extra_forms` payload for a Spanish token based on its POS.

    Only real word forms are included (no gender labels or other
    non-word-form metadata), since these values feed downstream
    answer-checking and masking.
    """
    if pos == "VERB":
        return conjugate_regular(lemma)
    if pos == "NOUN":
        return {"singular": lemma, "plural": pluralize_noun(lemma)}
    if pos == "ADJ":
        return adjective_forms(lemma)
    return None


_PRESENT_PERSON_NUMBER_KEYS = {
    ("1", "Sing"): "present_yo",
    ("2", "Sing"): "present_tu",
    ("3", "Sing"): "present_el",
    ("1", "Plur"): "present_nosotros",
    ("2", "Plur"): "present_vosotros",
    ("3", "Plur"): "present_ellos",
}


def is_irregular_es(token_text: str, lemma: str, morph: dict[str, str]) -> bool:
    """Conservatively detect Spanish verb irregularity: only compares present
    tense observed forms against the regularly-generated form for the same
    person/number. Returns False whenever the comparison cannot be made
    (missing morph info or non-infinitive lemma) rather than guessing.
    """
    if morph.get("Tense") != "Pres":
        return False

    person = morph.get("Person")
    number = morph.get("Number")
    key = (person, number)
    if key not in _PRESENT_PERSON_NUMBER_KEYS:
        return False

    forms = conjugate_regular(lemma)
    if forms is None:
        return False

    expected = forms[_PRESENT_PERSON_NUMBER_KEYS[key]]
    return token_text.lower() != expected.lower()
