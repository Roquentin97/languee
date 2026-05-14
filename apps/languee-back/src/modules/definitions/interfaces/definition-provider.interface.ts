export type Definition = {
  term: string;
  definition: string;
  examples: string[];
  part_of_speech: string;
  provider: string;
};

export type DefinitionProviderInput = {
  lemma: string;
  language: string;
};

export interface IDefinitionProvider {
  provide(input: DefinitionProviderInput): Promise<Definition[]>;
}
