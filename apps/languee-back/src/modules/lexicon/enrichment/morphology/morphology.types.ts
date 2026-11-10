import type { InflectionForms } from '../../types/inflection-forms.types';

export type CanonicalEntry = {
  wordId: string;
  lemma: string;
  partOfSpeech: string;
};

export type LexicalParadigm = {
  inflectionForms: InflectionForms | null;
  hasIrregularForms: boolean;
  snapshot: InflectionForms | null;
};

export type ParadigmsByWord = Map<string, Map<string, LexicalParadigm>>;

export type FormOrigin = {
  wordId: string;
  partOfSpeech: string;
  relationType: string;
};
