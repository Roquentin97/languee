export type LookupWordInput = {
  word: string;
  language: string;
};

export type DefinitionResult = {
  id: string;
  part_of_speech: string;
  definition: string;
  example: string | null;
  provider: string;
};

export type LookupWordOutput = {
  lemma: string;
  source: 'cache' | 'provider';
  definitions: DefinitionResult[];
};
