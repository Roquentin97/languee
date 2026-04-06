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
}

export interface DuplicateCheckOutput {
  duplicates: Definition[];
}

export interface GapFillMetadata {
  [key: string]: unknown;
}

export interface GapFilledOutput {
  definitions: Definition[];
  gap_fill_metadata: GapFillMetadata;
}

export interface CardOutput {
  id: string;
  term: string;
  lemma: string;
  definition: string;
  examples: string[];
  pos: string | null;
  is_multi_word: boolean;
  gap_fill_metadata: GapFillMetadata;
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
  check(input: LemmatizedOutput): Definition[];
}

export interface IDefinitionProvider {
  provide(input: LemmatizedOutput): Definition[];
}

export interface IGapFillService {
  fill(definitions: Definition[]): GapFilledOutput;
}

export interface ICardAssembler {
  assemble(
    input: NormalizedOutput & LemmatizedOutput & GapFilledOutput,
  ): CardOutput;
}
