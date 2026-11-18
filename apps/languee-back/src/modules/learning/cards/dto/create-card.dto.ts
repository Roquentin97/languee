import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import type { InflectionForms } from '../../../lexicon/types/inflection-forms.types';
import { CaptureRangeDto } from '../../capture/capture-range.dto';

export class CreateCardDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Lookup correlation ID for evaluation and save retries. If optional expression-base enrichment is unavailable during a retry, existing sense cards are returned without changing shared inflection-card membership or scheduling.',
  })
  @IsOptional()
  @IsUUID()
  lookupId?: string;
  @ApiProperty({
    format: 'uuid',
    example: '1db3f769-e154-44c6-9b98-87de1037a395',
  })
  @IsUUID()
  deckId!: string;

  @ApiProperty({
    format: 'uuid',
    example: 'a2e4529c-cfb7-4f4f-bdb2-0c15e590bf55',
  })
  @IsUUID()
  definitionId!: string;

  @ApiPropertyOptional({
    description:
      'User-provided context for the card, limited to 1,024 UTF-8 bytes.',
    example: 'She walked to the store.',
  })
  @IsOptional()
  @IsString()
  context?: string;

  @ApiPropertyOptional({
    type: [CaptureRangeDto],
    example: [
      { start: 5, end: 9 },
      { start: 13, end: 15 },
    ],
    nullable: true,
    description:
      'Chosen target components as ordered, non-overlapping half-open Unicode code-point ranges in context.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => CaptureRangeDto)
  targetRanges?: CaptureRangeDto[] | null;

  @ApiPropertyOptional({
    description: 'Inflection forms for the word',
    example: { base: 'walk', past: 'walked' },
  })
  @IsOptional()
  inflectionForms?: InflectionForms | null;
}
