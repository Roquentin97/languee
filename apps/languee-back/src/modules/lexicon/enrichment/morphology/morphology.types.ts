import type { InflectionForms } from '../../types/inflection-forms.types';

export type CanonicalEntry = {
  entryId: string;
  lemma: string;
  partOfSpeech: string;
};

export type LexicalParadigm = {
  inflectionForms: InflectionForms | null;
  hasIrregularForms: boolean;
  snapshot: InflectionForms | null;
};

export type ParadigmsByEntry = Map<string, Map<string, LexicalParadigm>>;

export type FormOrigin = {
  entryId: string;
  partOfSpeech: string;
  relationType: string;
};
