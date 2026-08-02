export class UnsupportedCardTypeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedCardTypeError';
  }
}
