export class NlpUnavailableError extends Error {
  constructor(cause?: unknown) {
    super('NLP service is unavailable');
    this.name = 'NlpUnavailableError';
    if (cause instanceof Error) {
      this.cause = cause;
    }
  }
}

export class NlpMultiWordError extends Error {
  constructor() {
    super('Multi-word input is not supported');
    this.name = 'NlpMultiWordError';
  }
}
