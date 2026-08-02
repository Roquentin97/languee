import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { InflectionForms } from '../../dictionary/types/inflection-forms.types';
import { INFLECTION_FORMS_SWAGGER } from '../../dictionary/types/inflection-forms.types';

export const CARD_TYPES = ['existing', 'inflection', 'definition'] as const;
export type CardTypeValue = (typeof CARD_TYPES)[number];

export class CardDeckRefDto {
  @ApiProperty({ example: 'deck_123' })
  id!: string;

  @ApiProperty({ example: 'English basics' })
  name!: string;
}

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

  @ApiProperty(INFLECTION_FORMS_SWAGGER)
  inflectionForms!: InflectionForms | null;
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

  @ApiProperty({ enum: CARD_TYPES, example: 'existing' })
  type!: CardTypeValue;

  @ApiProperty({ example: 'user_123' })
  userId!: string;

  @ApiProperty({ type: [CardDeckRefDto] })
  decks!: CardDeckRefDto[];

  @ApiPropertyOptional({
    description: 'Set for `existing` and `definition` cards',
    example: 'def_123',
    nullable: true,
  })
  definitionId!: string | null;

  @ApiPropertyOptional({
    description: 'Set for `inflection` cards',
    example: 'word_123',
    nullable: true,
  })
  wordId!: string | null;

  @ApiPropertyOptional({
    description: 'Set for `inflection` cards',
    example: 'verb',
    nullable: true,
  })
  partOfSpeech!: string | null;

  @ApiPropertyOptional({
    description: 'User-provided context for the card',
    example: 'She walked to the store.',
    nullable: true,
  })
  context!: string | null;

  @ApiPropertyOptional(INFLECTION_FORMS_SWAGGER)
  inflectionForms!: InflectionForms | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;

  @ApiPropertyOptional({
    description: 'Null for `inflection` cards',
    type: CardDefinitionResponseDto,
    nullable: true,
  })
  definition!: CardDefinitionResponseDto | null;

  @ApiProperty({ type: CardWordResponseDto })
  word!: CardWordResponseDto;
}

export class CreateCardsResponseDto {
  @ApiProperty({
    type: [CardResponseDto],
    description:
      'Every card generated or reused by this save: always an `existing` and a `definition` card, plus an `inflection` card when the word inflects.',
  })
  cards!: CardResponseDto[];
}

export class CardAnkiDroidExportSummaryResponseDto {
  @ApiProperty({ example: 'export_123' })
  id!: string;

  @ApiProperty({ enum: ['pending', 'completed', 'failed'], example: 'pending' })
  status!: string;

  @ApiPropertyOptional({ example: 'DECK_NOT_FOUND', nullable: true })
  failureReason!: string | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  lastAttemptedAt!: Date | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  completedAt!: Date | null;
}

export class CardListItemResponseDto extends CardResponseDto {
  @ApiPropertyOptional({
    type: CardAnkiDroidExportSummaryResponseDto,
    nullable: true,
  })
  ankiDroidExport!: CardAnkiDroidExportSummaryResponseDto | null;
}

export class CardDetailResponseDto extends CardListItemResponseDto {}
