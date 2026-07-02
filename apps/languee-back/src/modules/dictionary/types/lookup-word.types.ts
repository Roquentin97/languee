import type { LexicalKind } from '@prisma/client';
import { PartOfSpeech } from '../../vocabulary/enums/part-of-speech.enum';
import type { InflectionForms } from './inflection-forms.types';

export type LookupWordInput = {
  word: string;
  language: string;
  lemma?: string;
  pos?: string;
  isIrregular?: boolean;
  inflectionForms?: InflectionForms | null;
  kind?: LexicalKind;
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

export type LookupWordOutput = {
  lemma: string;
  source: 'cache' | 'provider';
  definitions: DefinitionResult[];
};
