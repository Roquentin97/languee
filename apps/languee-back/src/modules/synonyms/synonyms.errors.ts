export class SelfLinkError extends Error {
  constructor() {
    super('A definition cannot be linked to itself');
    this.name = 'SelfLinkError';
  }
}

export class DefinitionNotFoundError extends Error {
  constructor(public readonly missingIds: string[]) {
    super(`Definition(s) not found: ${missingIds.join(', ')}`);
    this.name = 'DefinitionNotFoundError';
  }
}

export class MeaningLinkAlreadyExistsError extends Error {
  constructor() {
    super(
      'A meaning link already exists between these definitions for this relation type',
    );
    this.name = 'MeaningLinkAlreadyExistsError';
  }
}

export class MeaningLinkNotFoundError extends Error {
  constructor() {
    super('Meaning link not found');
    this.name = 'MeaningLinkNotFoundError';
  }
}
