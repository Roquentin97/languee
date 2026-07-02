import { PartOfSpeech } from '../enums/part-of-speech.enum';

export type CreateUserDefinitionKind = 'word' | 'phrasal_verb' | 'expression';

export type CreateUserDefinitionInput = {
  text: string;
  language: string;
  kind: CreateUserDefinitionKind;
  definition: string;
  example?: string;
  partOfSpeech?: PartOfSpeech;
};

export type CreateUserDefinitionOutput = {
  id: string;
  wordId: string;
  lemma: string;
  kind: CreateUserDefinitionKind;
  partOfSpeech: PartOfSpeech;
  definition: string;
  example: string | null;
  provider: string;
};
