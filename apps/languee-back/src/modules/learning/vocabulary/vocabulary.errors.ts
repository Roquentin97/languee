export class PartOfSpeechRequiredError extends Error {
  constructor() {
    super('partOfSpeech is required when the text is a single word');
    this.name = 'PartOfSpeechRequiredError';
  }
}
