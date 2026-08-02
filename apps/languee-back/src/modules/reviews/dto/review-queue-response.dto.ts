import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CARD_TYPES } from '../../cards/dto/card-response.dto';
import type { CardTypeValue } from '../../cards/dto/card-response.dto';

export class ReviewDeckRefDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'English basics' })
  name!: string;
}

export class ClozeCardPayloadDto {
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

export class InflectionCardPayloadDto {
  @ApiProperty({ example: 'run' })
  lemma!: string;

  @ApiProperty({ example: 'verb' })
  partOfSpeech!: string;

  @ApiProperty({
    enum: ['word', 'phrasal_verb', 'expression'],
    example: 'word',
  })
  kind!: string;

  @ApiProperty({ example: 'en' })
  language!: string;

  @ApiProperty({
    description:
      'Which paradigm forms exist for this word, e.g. ["base","past","present3sg"]. Values are withheld - submit typed forms to POST /reviews/:cardId/check-forms for feedback.',
    example: [
      'base',
      'past',
      'present3sg',
      'presentNon3sg',
      'pastParticiple',
      'gerundParticiple',
    ],
    type: [String],
  })
  formKeys!: string[];
}

export class DefinitionCardPayloadDto {
  @ApiProperty({ example: 'run into' })
  lemma!: string;

  @ApiProperty({ example: 'verb' })
  partOfSpeech!: string;

  @ApiProperty({
    enum: ['word', 'phrasal_verb', 'expression'],
    example: 'phrasal_verb',
  })
  kind!: string;

  @ApiProperty({ example: 'en' })
  language!: string;

  @ApiPropertyOptional({
    description:
      "Glosses of the learner's other saved senses of the same lemma, only present with >=2 saved senses. No effect on scheduling.",
    example: ['a chance meeting', 'to strike an obstacle'],
    type: [String],
    nullable: true,
  })
  hint1!: string[] | null;

  @ApiPropertyOptional({
    description:
      "The lemma in context: the learner's captured sentence, else the dictionary example. No effect on scheduling.",
    example: 'Guess who I ran into at the station!',
    nullable: true,
  })
  hint2!: string | null;
}

export class ReviewQueueItemResponseDto {
  @ApiProperty({ format: 'uuid' })
  cardId!: string;

  @ApiProperty({ enum: CARD_TYPES, example: 'cloze' })
  type!: CardTypeValue;

  @ApiProperty({ type: [ReviewDeckRefDto] })
  decks!: ReviewDeckRefDto[];

  @ApiProperty({ example: false })
  isNew!: boolean;

  @ApiPropertyOptional({
    type: ClozeCardPayloadDto,
    nullable: true,
    description: 'Present only when type is `cloze`',
  })
  cloze!: ClozeCardPayloadDto | null;

  @ApiPropertyOptional({
    type: InflectionCardPayloadDto,
    nullable: true,
    description: 'Present only when type is `inflection`',
  })
  inflection!: InflectionCardPayloadDto | null;

  @ApiPropertyOptional({
    type: DefinitionCardPayloadDto,
    nullable: true,
    description: 'Present only when type is `definition`',
  })
  definition!: DefinitionCardPayloadDto | null;
}

export class ReviewQueueResponseDto {
  @ApiProperty({ type: [ReviewQueueItemResponseDto] })
  items!: ReviewQueueItemResponseDto[];
}
