import { ApiProperty } from '@nestjs/swagger';

export class CardDefinitionResponseDto {
  @ApiProperty({ example: 'def_123' })
  id!: string;

  @ApiProperty({ example: 'verb' })
  partOfSpeech!: string;

  @ApiProperty({ example: 'To move at a speed faster than a walk.' })
  definition!: string;

  @ApiProperty({ example: 'She runs every morning.', nullable: true })
  example!: string | null;

  @ApiProperty({ example: 'free-dictionary' })
  provider!: string;
}

export class CardWordResponseDto {
  @ApiProperty({ example: 'word_123' })
  id!: string;

  @ApiProperty({ example: 'run' })
  lemma!: string;

  @ApiProperty({ example: 'en' })
  language!: string;
}

export class CardResponseDto {
  @ApiProperty({ example: 'card_123' })
  id!: string;

  @ApiProperty({ example: 'deck_123' })
  deckId!: string;

  @ApiProperty({ example: 'user_123' })
  userId!: string;

  @ApiProperty({ example: 'def_123' })
  definitionId!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;

  @ApiProperty({ type: CardDefinitionResponseDto })
  definition!: CardDefinitionResponseDto;

  @ApiProperty({ type: CardWordResponseDto })
  word!: CardWordResponseDto;
}
