import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ReviewPromptResponseDto {
  @ApiProperty({ example: 'To encounter unexpectedly.' })
  definition!: string;

  @ApiPropertyOptional({
    description:
      "The sentence to test in, with every form of the target masked. The learner's own captured context when they have one, otherwise the dictionary example.",
    example: 'Guess who I ____ at the station!',
    nullable: true,
  })
  maskedSentence!: string | null;

  @ApiProperty({ example: 'verb' })
  partOfSpeech!: string;

  @ApiProperty({
    enum: ['word', 'phrasal_verb', 'expression'],
    example: 'phrasal_verb',
  })
  kind!: string;

  @ApiProperty({ example: 8 })
  lemmaLength!: number;

  @ApiProperty({
    example: 'en',
    description: 'ISO 639-1 language code of the card word, for TTS.',
  })
  language!: string;
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
