import type { LexicalKind } from '@prisma/client';
import { PartOfSpeech } from '../../../types/part-of-speech.enum';
import type { InflectionForms } from '../../../types/inflection-forms.types';

export type LookupWordInput = {
  word: string;
  language: string;
  lemma?: string;
  pos?: string;
  kind: LexicalKind;
};

export type DefinitionResult = {
  id: string;
  partOfSpeech: PartOfSpeech;
  definition: string;
  example: string | null;
  provider: string;
  hasIrregularForms: boolean;
  inflectionForms: InflectionForms | null;
};

export type LookupHeadword = {
  wordId: string;
  lemma: string;
  language: string;
  relations: { partOfSpeech: string; relationType: string }[];
  partsOfSpeech: {
    partOfSpeech: PartOfSpeech;
    definitions: DefinitionResult[];
  }[];
};

export type LookupWordOutput = {
  input: string;
  language: string;
  kind: LexicalKind;
  source: 'cache' | 'provider';
  preferred: { wordId: string; partOfSpeech: PartOfSpeech | null } | null;
  headwords: LookupHeadword[];
};
