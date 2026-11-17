import { PartOfSpeech } from '../../../lexicon/types/part-of-speech.enum';

export type CreateUserDefinitionKind =
  'word' | 'phrasal_verb' | 'expression' | 'idiom';

export type CreateUserDefinitionInput = {
  text: string;
  language: string;
  definition: string;
  example?: string;
  partOfSpeech?: PartOfSpeech;
};

export type CreateUserDefinitionOutput = {
  id: string;
  entryId: string;
  lemma: string;
  kind: CreateUserDefinitionKind;
  partOfSpeech: PartOfSpeech;
  definition: string;
  example: string | null;
  provider: string;
};
