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

export interface INormalizer {
  normalize(input: RawInput): NormalizedOutput;
}

export interface IPreLemmatizer {
  preLemmatize(input: NormalizedOutput): PreLemmatizedOutput;
}

export interface ILemmatizer {
  lemmatize(input: PreLemmatizedOutput): LemmatizedOutput;
}
