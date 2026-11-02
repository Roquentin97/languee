import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsUUID, IsOptional, IsString } from 'class-validator';
import type { InflectionForms } from '../../dictionary/types/inflection-forms.types';

export class CreateCardDto {
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
    description: 'User-provided context for the card',
    example: 'She walked to the store.',
  })
  @IsOptional()
  @IsString()
  context?: string;

  @ApiPropertyOptional({
    description: 'Inflection forms for the word',
    example: { base: 'walk', past: 'walked' },
  })
  @IsOptional()
  inflectionForms?: InflectionForms | null;
}
