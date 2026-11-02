export class CardAlreadyExistsError extends Error {
  constructor() {
    super('This definition is already in the specified deck');
    this.name = 'CardAlreadyExistsError';
  }
}

export class DefinitionNotFoundError extends Error {
  constructor() {
    super('Definition not found');
    this.name = 'DefinitionNotFoundError';
  }
}

export class CardNotFoundError extends Error {
  constructor() {
    super('Card not found or does not belong to this user');
    this.name = 'CardNotFoundError';
  }
}
