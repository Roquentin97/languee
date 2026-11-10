export class DeckAlreadyExistsError extends Error {
  constructor() {
    super('A deck with this name already exists for this user');
    this.name = 'DeckAlreadyExistsError';
  }
}

export class DeckNotFoundError extends Error {
  constructor() {
    super('Deck not found');
    this.name = 'DeckNotFoundError';
  }
}
