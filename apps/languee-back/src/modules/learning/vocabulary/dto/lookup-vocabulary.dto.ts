import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsString,
  IsNotEmpty,
  IsOptional,
  Length,
  Matches,
  ValidateNested,
} from 'class-validator';
import { CaptureRangeDto } from '../../capture/capture-range.dto';

export class LookupVocabularyDto {
  @ApiProperty({
    example: 'running',
    description:
      'Word or expression to look up, with at most six whitespace-separated components. Idioms and phrasal verbs are supported.',
  })
  @IsString()
  @IsNotEmpty({ message: 'TEXT_REQUIRED' })
  text!: string;

  @ApiPropertyOptional({
    example: 'en',
    default: 'en',
    minLength: 2,
    maxLength: 2,
    pattern: '^[a-z]{2}$',
    description: 'ISO 639-1 language code',
  })
  @IsOptional()
  @IsString()
  @Length(2, 2)
  @Matches(/^[a-z]{2}$/, { message: 'INVALID_LANGUAGE' })
  language?: string;

  @ApiPropertyOptional({
    example: 'She runs every morning.',
    description:
      'Sentence or phrase used to infer part of speech, limited to 1,024 UTF-8 bytes.',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  context?: string;

  @ApiPropertyOptional({
    type: [CaptureRangeDto],
    example: [
      { start: 0, end: 3 },
      { start: 8, end: 11 },
    ],
    description:
      'Ordered, non-overlapping half-open Unicode code-point ranges, one per selected word.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => CaptureRangeDto)
  selectionRanges?: CaptureRangeDto[];

  @ApiPropertyOptional({
    type: Boolean,
    default: true,
    description: 'Include contextual expression and base-verb alternatives.',
  })
  @IsOptional()
  @IsBoolean()
  includeSuggestions?: boolean;

  @ApiPropertyOptional({
    type: Boolean,
    example: false,
    description:
      'Do not select a context-derived preferred part of speech; all groups are always returned.',
  })
  @IsOptional()
  @IsBoolean()
  disablePosFiltering?: boolean;
}
