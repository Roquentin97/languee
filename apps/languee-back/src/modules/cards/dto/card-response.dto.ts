export class CardResponseDto {
  id!: string;
  deckId!: string;
  userId!: string;
  definitionId!: string;
  createdAt!: Date;
  updatedAt!: Date;
  definition!: {
    id: string;
    partOfSpeech: string;
    definition: string;
    example: string | null;
    provider: string;
  };
  word!: {
    id: string;
    lemma: string;
    language: string;
  };
}
