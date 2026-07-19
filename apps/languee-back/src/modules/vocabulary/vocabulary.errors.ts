export class TextMustBeSingleWordError extends Error {
  constructor() {
    super('Text must be a single word for kind "word"');
    this.name = 'TextMustBeSingleWordError';
  }
}

export class TextMustBeExpressionError extends Error {
  constructor() {
    super(
      'Text must contain 2 to 6 words for kind "phrasal_verb" or "expression"',
    );
    this.name = 'TextMustBeExpressionError';
  }
}

export class PartOfSpeechRequiredError extends Error {
  constructor() {
    super('partOfSpeech is required for kind "word"');
    this.name = 'PartOfSpeechRequiredError';
  }
}
