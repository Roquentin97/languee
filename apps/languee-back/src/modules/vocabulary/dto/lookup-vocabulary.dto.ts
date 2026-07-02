import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsIn,
  Length,
  Matches,
} from 'class-validator';
import { MaxWhitespaceTokens } from '../validators/token-limit.validator';

export class LookupVocabularyDto {
  @ApiProperty({
    example: 'running',
    description:
      'Word or expression to look up. Up to 6 whitespace-separated tokens are supported for idioms and phrasal verbs.',
  })
  @IsString()
  @IsNotEmpty({ message: 'WORD_REQUIRED' })
  @MaxWhitespaceTokens(6, { message: 'EXPRESSION_TOO_LONG' })
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
