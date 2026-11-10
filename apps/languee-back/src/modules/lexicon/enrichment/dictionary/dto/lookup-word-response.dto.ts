import { ApiProperty } from '@nestjs/swagger';
import { PartOfSpeech } from '../../../types/part-of-speech.enum';
import type { InflectionForms } from '../../../types/inflection-forms.types';
import { INFLECTION_FORMS_SWAGGER } from '../../../types/inflection-forms.types';

export class DefinitionResultDto {
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
}

export class SurfaceRelationDto {
  @ApiProperty({ enum: PartOfSpeech })
  partOfSpeech!: PartOfSpeech;

  @ApiProperty({ example: 'comparative' })
  relationType!: string;
}

export class PreferredInterpretationDto {
  @ApiProperty({ example: 'word_123' })
  wordId!: string;

  @ApiProperty({ enum: PartOfSpeech, nullable: true })
  partOfSpeech!: PartOfSpeech | null;
}

export class DictionaryPosGroupDto {
  @ApiProperty({ enum: PartOfSpeech })
  partOfSpeech!: PartOfSpeech;

  @ApiProperty({ type: [DefinitionResultDto] })
  definitions!: DefinitionResultDto[];
}

export class DictionaryHeadwordDto {
  @ApiProperty({ example: 'word_123' })
  wordId!: string;

  @ApiProperty({ example: 'good' })
  lemma!: string;

  @ApiProperty({ example: 'en' })
  language!: string;

  @ApiProperty({ type: [SurfaceRelationDto] })
  relations!: SurfaceRelationDto[];

  @ApiProperty({ type: [DictionaryPosGroupDto] })
  partsOfSpeech!: DictionaryPosGroupDto[];
}

export class LookupWordResponseDto {
  @ApiProperty({ example: 'better' })
  input!: string;

  @ApiProperty({ example: 'en' })
  language!: string;

  @ApiProperty({ enum: ['word', 'expression', 'phrasal_verb'] })
  kind!: string;

  @ApiProperty({ enum: ['cache', 'provider'], example: 'cache' })
  source!: 'cache' | 'provider';

  @ApiProperty({ type: PreferredInterpretationDto, nullable: true })
  preferred!: PreferredInterpretationDto | null;

  @ApiProperty({ type: [DictionaryHeadwordDto] })
  headwords!: DictionaryHeadwordDto[];
}
