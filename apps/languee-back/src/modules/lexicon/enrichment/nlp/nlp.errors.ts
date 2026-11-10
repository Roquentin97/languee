export class NlpUnavailableError extends Error {
  constructor(cause?: unknown) {
    super('NLP service is unavailable');
    this.name = 'NlpUnavailableError';
    if (cause instanceof Error) {
      this.cause = cause;
    }
  }
}

export class NlpInputInvalidError extends Error {
  constructor() {
    super('NLP rejected the input as invalid');
    this.name = 'NlpInputInvalidError';
  }
}
