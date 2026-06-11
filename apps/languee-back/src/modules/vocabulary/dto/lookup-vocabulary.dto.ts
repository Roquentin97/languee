import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsIn,
  Length,
  Matches,
} from 'class-validator';

export class LookupVocabularyDto {
  @IsString()
  @IsNotEmpty({ message: 'WORD_REQUIRED' })
  word!: string;

  @IsOptional()
  @IsString()
  @Length(2, 2)
  @Matches(/^[a-z]{2}$/, { message: 'INVALID_LANGUAGE' })
  language?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  context?: string;

  @IsOptional()
  @IsIn(['true', 'false'])
  disablePosFiltering?: 'true' | 'false';
}
