import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class AnswerCardDto {
  @ApiProperty({ example: 'come across' })
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/, { message: 'typedAnswer must not be blank' })
  typedAnswer!: string;
}
