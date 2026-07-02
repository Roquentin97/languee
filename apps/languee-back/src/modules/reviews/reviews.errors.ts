export class CardOwnershipError extends Error {
  constructor() {
    super('Card not found or does not belong to this user');
    this.name = 'CardOwnershipError';
  }
}

export class DeckOwnershipError extends Error {
  constructor() {
    super('Deck not found or does not belong to this user');
    this.name = 'DeckOwnershipError';
  }
}
