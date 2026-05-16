import { IsString, IsNotEmpty, Length, Matches } from 'class-validator';

export class CreateDeckDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  @Length(2, 2)
  @Matches(/^[a-z]{2}$/, { message: 'INVALID_LANGUAGE' })
  language!: string;
}
