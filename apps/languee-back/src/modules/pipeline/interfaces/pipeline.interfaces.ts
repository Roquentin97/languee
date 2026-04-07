export interface RawInput {
  raw: string;
}

export interface NormalizedOutput {
  normalized_form: string;
  is_multi_word: boolean;
  pos: string | null;
}

export interface PreLemmatizedOutput {
  lemma: string;
  short_circuited: boolean;
}

export interface LemmatizedOutput {
  lemma: string;
}

export interface Definition {
  term: string;
  definition: string;
  examples: string[];
  part_of_speech: string;
  provider: string;
}

export interface DuplicateCheckInput {
  lemma: string;
  deck_id: string;
  definition_id?: string;
}

export interface DefinitionProviderInput {
  lemma: string;
  language: string;
}

export interface GapFillInput {
  definitions: Definition[];
  hints_context: string;
}

export interface GapFilledOutput {
  definitions: Definition[];
  hints: string;
}

export interface CardAssemblerInput {
  deck_id: string;
  user_id: string;
  definition_id: string;
  hints: string;
}

export interface CardOutput {
  id: string;
  definition_id: string;
  deck_id: string;
  user_id: string;
  term: string;
  lemma: string;
  definition: string;
  examples: string[];
  part_of_speech: string;
  hints: string;
  nuance: string | null;
  created_at: Date;
  updated_at: Date;
}

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
  provide(input: DefinitionProviderInput): Definition[];
}

export interface IGapFillService {
  fill(input: GapFillInput): GapFilledOutput;
}

export interface ICardAssembler {
  assemble(input: CardAssemblerInput): CardOutput;
}
