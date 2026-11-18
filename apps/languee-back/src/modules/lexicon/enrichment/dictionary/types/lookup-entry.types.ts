import type { LexicalEntryKind } from '@prisma/client';
import { PartOfSpeech } from '../../../types/part-of-speech.enum';
import type { InflectionForms } from '../../../types/inflection-forms.types';

export type LookupEntryInput = {
  text: string;
  language: string;
  lemma?: string;
  pos?: string;
  kind: LexicalEntryKind;
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

export type LookupEntry = {
  entryId: string;
  lemma: string;
  language: string;
  relations: { partOfSpeech: string; relationType: string }[];
  partsOfSpeech: {
    partOfSpeech: PartOfSpeech;
    definitions: DefinitionResult[];
  }[];
};

export type LookupEntryOutput = {
  input: string;
  language: string;
  kind: LexicalEntryKind;
  source: 'cache' | 'provider';
  preferred: { entryId: string; partOfSpeech: PartOfSpeech | null } | null;
  headwords: LookupEntry[];
};
