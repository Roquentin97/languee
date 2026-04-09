export type RawInput = {
  raw: string;
};

export type NormalizedOutput = {
  normalized_form: string;
  is_multi_word: boolean;
  pos: string | null;
};

export type PreLemmatizedOutput = {
  lemma: string;
  short_circuited: boolean;
};

export type LemmatizedOutput = {
  lemma: string;
};

export type Definition = {
  term: string;
  definition: string;
  examples: string[];
  part_of_speech: string;
  provider: string;
};

export type DuplicateCheckInput = {
  lemma: string;
  deck_id: string;
  definition_id?: string;
};

export type DefinitionProviderInput = {
  lemma: string;
  language: string;
};

export type GapFillInput = {
  definitions: Definition[];
  context: {
    deck_id: string;
    user_id: string;
  };
};

export type GapFilledOutput = {
  definitions: Definition[];
  hints: string;
  gap_fill_metadata: Record<string, unknown>;
};

export type CardAssemblerInput = {
  deck_id: string;
  user_id: string;
  definition_id: string;
  hints: string;
};

export type CardOutput = {
  id: string;
  deck_id: string;
  user_id: string;
  definition_id: string;
  front: string;
  back: string;
  hints: string;
  nuance: string | null;
  created_at: string;
  updated_at: string;
};

export interface INormalizer {
  normalize(input: RawInput): NormalizedOutput;
}

export interface IPreLemmatizer {
  preLemmatize(input: NormalizedOutput): PreLemmatizedOutput;
}

export interface ILemmatizer {
  lemmatize(input: PreLemmatizedOutput): LemmatizedOutput;
}

export interface IDuplicateChecker {
  check(input: DuplicateCheckInput): Definition[];
}

export interface IDefinitionProvider {
  provide(input: DefinitionProviderInput): Promise<Definition[]>;
}

export interface IGapFillService {
  fill(input: GapFillInput): GapFilledOutput;
}

export interface ICardAssembler {
  assemble(input: CardAssemblerInput): CardOutput;
}
