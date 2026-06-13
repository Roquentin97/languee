import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PartOfSpeech } from '../enums/part-of-speech.enum';

export class DeckRefDto {
  @ApiProperty({ example: 'deck_123' })
  id!: string;

  @ApiProperty({ example: 'English basics' })
  name!: string;
}

export class EnrichedDefinitionResultDto {
  @ApiProperty({ example: 'def_123' })
  id!: string;

  @ApiProperty({ enum: PartOfSpeech, example: PartOfSpeech.VERB })
  partOfSpeech!: PartOfSpeech;

  @ApiProperty({ example: 'To move at a speed faster than a walk.' })
  definition!: string;

  @ApiProperty({ example: 'She runs every morning.', nullable: true })
  example!: string | null;

  @ApiProperty({ example: 'free-dictionary' })
  provider!: string;

  @ApiProperty({ example: true })
  hasIrregularForms!: boolean;

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string' },
    nullable: true,
    example: { base: 'run', past: 'ran' },
  })
  inflectionForms!: Record<string, string> | null;

  @ApiProperty({ type: [DeckRefDto] })
  decks!: DeckRefDto[];
}

export class LookupVocabularyMetaDto {
  @ApiProperty({ example: true })
  filteredByPos!: boolean;

  @ApiProperty({ example: false })
  unmatchedPos!: boolean;

  @ApiProperty({ enum: PartOfSpeech, isArray: true, example: ['verb'] })
  availablePartsOfSpeech!: PartOfSpeech[];
}

export class LookupVocabularyResponseDto {
  @ApiProperty({ example: 'running' })
  input!: string;

  @ApiPropertyOptional({ example: 'She runs every morning.' })
  context?: string;

  @ApiProperty({ example: 'run' })
  lemma!: string;

  @ApiProperty({
    enum: PartOfSpeech,
    nullable: true,
    example: PartOfSpeech.VERB,
  })
  partOfSpeech!: PartOfSpeech | null;

  @ApiProperty({ type: [EnrichedDefinitionResultDto] })
  definitions!: EnrichedDefinitionResultDto[];

  @ApiProperty({ type: LookupVocabularyMetaDto })
  meta!: LookupVocabularyMetaDto;
}
