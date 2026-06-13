import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsIn,
  Length,
  Matches,
} from 'class-validator';

export class LookupVocabularyDto {
  @ApiProperty({ example: 'running', description: 'Word to look up' })
  @IsString()
  @IsNotEmpty({ message: 'WORD_REQUIRED' })
  word!: string;

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
    description: 'Sentence or phrase used to infer part of speech',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  context?: string;

  @ApiPropertyOptional({
    enum: ['true', 'false'],
    example: 'false',
    description: 'Disable context-derived part-of-speech filtering',
  })
  @IsOptional()
  @IsIn(['true', 'false'])
  disablePosFiltering?: 'true' | 'false';
}
