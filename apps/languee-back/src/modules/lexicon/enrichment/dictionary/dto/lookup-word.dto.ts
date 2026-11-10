import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  Length,
  Matches,
} from 'class-validator';

export class LookupWordDto {
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
}
