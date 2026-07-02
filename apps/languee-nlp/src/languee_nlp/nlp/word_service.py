import logging

import spacy.tokens
from lemminflect import getInflection

from languee_nlp.nlp.german_inflections import (
    build_german_extra_forms,
    is_irregular_de,
)
from languee_nlp.nlp.spanish_inflections import (
    build_spanish_extra_forms,
    is_irregular_es,
)
from languee_nlp.schemas import FormsResult, MorphologyResult, TokenResult

logger = logging.getLogger(__name__)


def _null_forms() -> FormsResult:
    return FormsResult(
        verb_base=None,
        verb_past=None,
        verb_present_3sg=None,
        verb_present_non_3sg=None,
        verb_gerund_participle=None,
        verb_past_participle=None,
        noun_singular=None,
        noun_plural=None,
        adj_positive=None,
        adj_comparative=None,
        adj_superlative=None,
    )


def _build_morphology(token: spacy.tokens.Token) -> MorphologyResult:
    morph: dict[str, str] = token.morph.to_dict()
    return MorphologyResult(
        tense=morph.get("Tense"),
        verb_form=morph.get("VerbForm"),
        number=morph.get("Number"),
        degree=morph.get("Degree"),
    )


def _build_forms(token: spacy.tokens.Token) -> FormsResult:
    pos = token.pos_
    lemma = token.lemma_

    if pos == "VERB":
        return FormsResult(
            verb_base=_first(getInflection(lemma, tag="VB")),
            verb_past=_first(getInflection(lemma, tag="VBD")),
            verb_present_3sg=_first(getInflection(lemma, tag="VBZ")),
            verb_present_non_3sg=_first(getInflection(lemma, tag="VBP")),
            verb_gerund_participle=_first(getInflection(lemma, tag="VBG")),
            verb_past_participle=_first(getInflection(lemma, tag="VBN")),
            noun_singular=None,
            noun_plural=None,
            adj_positive=None,
            adj_comparative=None,
            adj_superlative=None,
        )
    if pos == "NOUN":
        return FormsResult(
            verb_base=None,
            verb_past=None,
            verb_present_3sg=None,
            verb_present_non_3sg=None,
            verb_gerund_participle=None,
            verb_past_participle=None,
            noun_singular=_first(getInflection(lemma, tag="NN")),
            noun_plural=_first(getInflection(lemma, tag="NNS")),
            adj_positive=None,
            adj_comparative=None,
            adj_superlative=None,
        )
    if pos in ("ADJ", "ADV"):
        return FormsResult(
            verb_base=None,
            verb_past=None,
            verb_present_3sg=None,
            verb_present_non_3sg=None,
            verb_gerund_participle=None,
            verb_past_participle=None,
            noun_singular=None,
            noun_plural=None,
            adj_positive=lemma,
            adj_comparative=_first(getInflection(lemma, tag="JJR")),
            adj_superlative=_first(getInflection(lemma, tag="JJS")),
        )
    logger.debug(
        "no forms for pos",
        extra={
            "event": "nlp.no_forms_for_pos",
            "method": _build_forms.__name__,
            "data": {"pos": pos},
        },
    )
    return FormsResult(
        verb_base=None,
        verb_past=None,
        verb_present_3sg=None,
        verb_present_non_3sg=None,
        verb_gerund_participle=None,
        verb_past_participle=None,
        noun_singular=None,
        noun_plural=None,
        adj_positive=None,
        adj_comparative=None,
        adj_superlative=None,
    )


def _first(result: tuple[str, ...] | None) -> str | None:
    if result:
        return result[0]
    return None


def _is_irregular(token: spacy.tokens.Token) -> bool:
    morph: dict[str, str] = token.morph.to_dict()
    pos = token.pos_
    text = token.text
    lemma = token.lemma_

    if pos == "VERB":
        tense = morph.get("Tense")
        verb_form = morph.get("VerbForm")
        if tense == "Past" or verb_form == "Part":
            regular = text == lemma + "ed" or text == lemma + "d"
            if not regular:
                logger.debug(
                    "irregular form detected",
                    extra={
                        "event": "nlp.irregular_form_detected",
                        "method": _is_irregular.__name__,
                        "data": {"text": text, "lemma": lemma, "pos": pos},
                    },
                )
            return not regular
    elif pos == "NOUN":
        number = morph.get("Number")
        if number == "Plur":
            ends_with_y = lemma.endswith("y") and text == lemma[:-1] + "ies"
            regular = text == lemma + "s" or text == lemma + "es" or ends_with_y
            if not regular:
                logger.debug(
                    "irregular form detected",
                    extra={
                        "event": "nlp.irregular_form_detected",
                        "method": _is_irregular.__name__,
                        "data": {"text": text, "lemma": lemma, "pos": pos},
                    },
                )
            return not regular
    elif pos in ("ADJ", "ADV"):
        degree = morph.get("Degree")
        if degree == "Cmp" or degree == "Sup":
            regular = text == lemma + "er" or text == lemma + "est"
            if not regular:
                logger.debug(
                    "irregular form detected",
                    extra={
                        "event": "nlp.irregular_form_detected",
                        "method": _is_irregular.__name__,
                        "data": {"text": text, "lemma": lemma, "pos": pos},
                    },
                )
            return not regular

    return False


def analyze_single_token(
    token: spacy.tokens.Token, language: str = "en"
) -> TokenResult:
    if language == "es":
        morph: dict[str, str] = token.morph.to_dict()
        result = TokenResult(
            text=token.text,
            lemma=token.lemma_,
            pos=token.pos_,
            is_irregular=is_irregular_es(token.text, token.lemma_, morph),
            morphology=_build_morphology(token),
            forms=_null_forms(),
            extra_forms=build_spanish_extra_forms(token.lemma_, token.pos_, morph),
        )
    elif language == "de":
        de_morph: dict[str, str] = token.morph.to_dict()
        result = TokenResult(
            text=token.text,
            lemma=token.lemma_,
            pos=token.pos_,
            is_irregular=is_irregular_de(token.text, token.lemma_, de_morph),
            morphology=_build_morphology(token),
            forms=_null_forms(),
            extra_forms=build_german_extra_forms(token.lemma_, token.pos_, de_morph),
        )
    else:
        result = TokenResult(
            text=token.text,
            lemma=token.lemma_,
            pos=token.pos_,
            is_irregular=_is_irregular(token),
            morphology=_build_morphology(token),
            forms=_build_forms(token),
            extra_forms=None,
        )
    logger.info(
        "token analyzed",
        extra={
            "event": "nlp.token_analyzed",
            "method": analyze_single_token.__name__,
            "data": {
                "text": result.text,
                "lemma": result.lemma,
                "pos": result.pos,
                "is_irregular": result.is_irregular,
                "language": language,
            },
        },
    )
    return result
