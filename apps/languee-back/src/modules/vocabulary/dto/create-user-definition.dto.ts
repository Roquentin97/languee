import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';
import { PartOfSpeech } from '../enums/part-of-speech.enum';

export class CreateUserDefinitionDto {
  @ApiProperty({
    example: 'run into',
    minLength: 1,
    maxLength: 64,
    description: 'Word or expression the definition is for',
  })
  @IsString()
  @IsNotEmpty({ message: 'TEXT_REQUIRED' })
  @Length(1, 64, { message: 'TEXT_LENGTH_INVALID' })
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

  @ApiProperty({
    example: 'To encounter someone or something unexpectedly.',
    minLength: 1,
    maxLength: 500,
  })
  @IsString()
  @IsNotEmpty({ message: 'DEFINITION_REQUIRED' })
  @Length(1, 500, { message: 'DEFINITION_LENGTH_INVALID' })
  definition!: string;

  @ApiPropertyOptional({
    example: 'I ran into an old friend yesterday.',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @Length(0, 500, { message: 'EXAMPLE_LENGTH_INVALID' })
  example?: string;

  @ApiPropertyOptional({
    enum: PartOfSpeech,
    example: PartOfSpeech.PHRASE,
    description:
      'Required when the text is a single word; expressions default to "phrase".',
  })
  @IsOptional()
  @IsEnum(PartOfSpeech, { message: 'INVALID_PART_OF_SPEECH' })
  partOfSpeech?: PartOfSpeech;
}
