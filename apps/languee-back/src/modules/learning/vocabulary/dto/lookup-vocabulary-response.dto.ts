import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  PreferredInterpretationDto,
  SurfaceRelationDto,
} from '../../../lexicon/enrichment/dictionary/dto/lookup-word-response.dto';
import { PartOfSpeech } from '../../../lexicon/types/part-of-speech.enum';
import type { InflectionForms } from '../../../lexicon/types/inflection-forms.types';
import { INFLECTION_FORMS_SWAGGER } from '../../../lexicon/types/inflection-forms.types';

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

  @ApiProperty(INFLECTION_FORMS_SWAGGER)
  inflectionForms!: InflectionForms | null;

  @ApiProperty({ type: [DeckRefDto] })
  decks!: DeckRefDto[];
}

export class LookupVocabularyMetaDto {
  @ApiProperty({ example: 'good' })
  analyzedLemma!: string;

  @ApiProperty({ enum: PartOfSpeech, nullable: true })
  analyzedPos!: PartOfSpeech | null;

  @ApiProperty({
    example: true,
    description:
      'Whether the existing context-based POS filter applies to the preferred presentation. All groups remain in headwords.',
  })
  filteredByPos!: boolean;

  @ApiProperty({ example: false })
  unmatchedPos!: boolean;

  @ApiProperty({ enum: PartOfSpeech, isArray: true, example: ['verb'] })
  availablePartsOfSpeech!: PartOfSpeech[];

  @ApiProperty({ example: false })
  isExpression!: boolean;

  @ApiProperty({ example: false })
  providerMiss!: boolean;

  @ApiProperty({ example: null, nullable: true })
  expressionContextFound!: boolean | null;
}

export class VocabularyPosGroupDto {
  @ApiProperty({ enum: PartOfSpeech })
  partOfSpeech!: PartOfSpeech;

  @ApiProperty({ type: [EnrichedDefinitionResultDto] })
  definitions!: EnrichedDefinitionResultDto[];
}

export class VocabularyHeadwordDto {
  @ApiProperty({ example: 'word_123' })
  wordId!: string;

  @ApiProperty({ example: 'good' })
  lemma!: string;

  @ApiProperty({ example: 'en' })
  language!: string;

  @ApiProperty({ type: [SurfaceRelationDto] })
  relations!: SurfaceRelationDto[];

  @ApiProperty({ type: [VocabularyPosGroupDto] })
  partsOfSpeech!: VocabularyPosGroupDto[];
}

export class LookupVocabularyResponseDto {
  @ApiProperty({ example: 'better' })
  input!: string;

  @ApiPropertyOptional({ example: 'This is better.' })
  context?: string;

  @ApiProperty({ example: 'en' })
  language!: string;

  @ApiProperty({ enum: ['word', 'phrasal_verb', 'expression'] })
  kind!: string;

  @ApiProperty({ enum: ['cache', 'provider'] })
  source!: string;

  @ApiProperty({ type: PreferredInterpretationDto, nullable: true })
  preferred!: PreferredInterpretationDto | null;

  @ApiProperty({ type: [VocabularyHeadwordDto] })
  headwords!: VocabularyHeadwordDto[];

  @ApiProperty({ type: LookupVocabularyMetaDto })
  meta!: LookupVocabularyMetaDto;
}
