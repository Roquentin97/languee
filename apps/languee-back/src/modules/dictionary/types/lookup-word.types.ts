import { PartOfSpeech } from '../../vocabulary/enums/part-of-speech.enum';

export type LookupWordInput = {
  word: string;
  language: string;
  lemma?: string;
  pos?: string;
  isIrregular?: boolean;
  inflectionForms?: Record<string, string>;
};

export type DefinitionResult = {
  id: string;
  part_of_speech: PartOfSpeech;
  definition: string;
  example: string | null;
  provider: string;
  hasIrregularForms: boolean;
  inflectionForms: Record<string, string> | null;
};

export type LookupWordOutput = {
  lemma: string;
  source: 'cache' | 'provider';
  definitions: DefinitionResult[];
};
