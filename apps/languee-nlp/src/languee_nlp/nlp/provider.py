import spacy

from languee_nlp.settings import settings

_nlp: spacy.Language | None = None


def get_nlp(model_name: str | None = None) -> spacy.Language:
    global _nlp
    if _nlp is None:
        name = model_name if model_name is not None else settings.spacy_model
        _nlp = spacy.load(name)
    return _nlp


def reset_nlp() -> None:
    """Reset the cached NLP model. For test use only."""
    global _nlp
    _nlp = None
