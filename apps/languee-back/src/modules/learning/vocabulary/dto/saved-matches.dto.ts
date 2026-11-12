import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsString,
} from 'class-validator';
import { MAX_CAPTURE_TEXT_BYTES } from '../capture-input';

export class SavedMatchesDto {
  @ApiProperty({ example: 'en', enum: ['en'] })
  @IsIn(['en'], { message: 'UNSUPPORTED_LANGUAGE' })
  language!: 'en';

  @ApiProperty({
    example: 'The expressways connect the cities.',
    description: 'Unchanged capture text, limited to 1,024 UTF-8 bytes.',
  })
  @IsString()
  @IsNotEmpty({ message: 'CAPTURE_TOKENS_INVALID' })
  text!: string;

  @ApiProperty({
    example: ['the', 'expressways', 'connect', 'cities'],
    type: [String],
    maxItems: MAX_CAPTURE_TEXT_BYTES,
    description:
      'Distinct normalized Unicode-letter tokens in first-occurrence order.',
  })
  @IsArray({ message: 'CAPTURE_TOKENS_INVALID' })
  @ArrayMinSize(1, { message: 'CAPTURE_TOKENS_INVALID' })
  @ArrayMaxSize(MAX_CAPTURE_TEXT_BYTES, { message: 'CAPTURE_TOKENS_INVALID' })
  @IsString({ each: true, message: 'CAPTURE_TOKENS_INVALID' })
  @IsNotEmpty({ each: true, message: 'CAPTURE_TOKENS_INVALID' })
  tokens!: string[];
}

export class SavedMatchDeckDto {
  @ApiProperty({ example: 'deck_123' })
  id!: string;

  @ApiProperty({ example: 'English' })
  name!: string;
}

export class SavedMatchDefinitionDto {
  @ApiProperty({ example: 'definition_123' })
  definitionId!: string;

  @ApiProperty({ example: 'noun' })
  partOfSpeech!: string;

  @ApiProperty({ example: 'A high-speed road with controlled access.' })
  definition!: string;

  @ApiProperty({ type: [SavedMatchDeckDto] })
  decks!: SavedMatchDeckDto[];
}

export class SavedMatchHeadwordDto {
  @ApiProperty({ example: 'word_123' })
  wordId!: string;

  @ApiProperty({ example: 'expressway' })
  lemma!: string;

  @ApiProperty({ type: [SavedMatchDefinitionDto] })
  definitions!: SavedMatchDefinitionDto[];
}

export class SavedMatchDto {
  @ApiProperty({ example: 'expressways' })
  surface!: string;

  @ApiProperty({ type: [SavedMatchHeadwordDto] })
  headwords!: SavedMatchHeadwordDto[];
}

export class SavedMatchesResponseDto {
  @ApiProperty({ type: [SavedMatchDto] })
  matches!: SavedMatchDto[];
}
