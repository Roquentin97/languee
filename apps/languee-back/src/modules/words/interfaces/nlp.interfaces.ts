export type RawInput = {
  raw: string;
};

export type NormalizedOutput = {
  normalizedForm: string;
  isMultiWord: boolean;
  pos: string | null;
};

export type PreLemmatizedOutput = {
  lemma: string;
  shortCircuited: boolean;
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
