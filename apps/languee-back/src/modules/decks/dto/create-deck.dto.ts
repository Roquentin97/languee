import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, Length, Matches } from 'class-validator';

export class CreateDeckDto {
  @ApiProperty({ example: 'English basics' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({
    example: 'en',
    minLength: 2,
    maxLength: 2,
    pattern: '^[a-z]{2}$',
    description: 'ISO 639-1 language code',
  })
  @IsString()
  @IsNotEmpty()
  @Length(2, 2)
  @Matches(/^[a-z]{2}$/, { message: 'INVALID_LANGUAGE' })
  language!: string;
}
