export class ExportNotFoundError extends Error {
  constructor() {
    super('AnkiDroid export not found');
    this.name = 'ExportNotFoundError';
  }
}

export class ExportNotOwnedError extends Error {
  constructor() {
    super('AnkiDroid export does not belong to this user');
    this.name = 'ExportNotOwnedError';
  }
}

export class CardNotFoundOrNotOwnedError extends Error {
  constructor() {
    super('Card not found or does not belong to this user');
    this.name = 'CardNotFoundOrNotOwnedError';
  }
}
