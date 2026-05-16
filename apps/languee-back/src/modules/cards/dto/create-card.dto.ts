import { IsUUID } from 'class-validator';

export class CreateCardDto {
  @IsUUID()
  deckId!: string;

  @IsUUID()
  definitionId!: string;
}
