import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ReviewPromptResponseDto {
  @ApiProperty({ example: 'To encounter unexpectedly.' })
  definition!: string;

  @ApiPropertyOptional({
    example: 'I ____ an old friend yesterday.',
    nullable: true,
  })
  example!: string | null;

  @ApiPropertyOptional({
    example: 'Guess who I ____ at the station!',
    nullable: true,
  })
  contextMasked!: string | null;

  @ApiProperty({ example: 'verb' })
  partOfSpeech!: string;

  @ApiProperty({
    enum: ['word', 'phrasal_verb', 'expression'],
    example: 'phrasal_verb',
  })
  kind!: string;

  @ApiProperty({ example: 8 })
  lemmaLength!: number;
}

export class ReviewQueueItemResponseDto {
  @ApiProperty({ format: 'uuid' })
  cardId!: string;

  @ApiProperty({ format: 'uuid' })
  deckId!: string;

  @ApiProperty({ example: 'English basics' })
  deckName!: string;

  @ApiProperty({ example: false })
  isNew!: boolean;

  @ApiProperty({ type: ReviewPromptResponseDto })
  prompt!: ReviewPromptResponseDto;
}

export class ReviewQueueResponseDto {
  @ApiProperty({ type: [ReviewQueueItemResponseDto] })
  items!: ReviewQueueItemResponseDto[];
}
