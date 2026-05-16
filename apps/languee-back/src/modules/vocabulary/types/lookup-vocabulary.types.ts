export type LookupVocabularyInput = {
  word: string;
  language: string;
  userId: string;
};

export type DeckRef = {
  id: string;
  name: string;
};

export type EnrichedDefinitionResult = {
  id: string;
  partOfSpeech: string;
  definition: string;
  example: string | null;
  provider: string;
  decks: DeckRef[];
};

export type LookupVocabularyOutput = {
  lemma: string;
  source: 'cache' | 'provider';
  definitions: EnrichedDefinitionResult[];
};
