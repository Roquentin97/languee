export class DefinitionsNotFoundException extends Error {
  constructor(lemma: string, language: string) {
    super(`No definitions found for "${lemma}" in language "${language}"`);
    this.name = 'DefinitionsNotFoundException';
  }
}
