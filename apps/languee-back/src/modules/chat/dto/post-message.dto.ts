import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Length, Matches } from 'class-validator';

export class PostMessageDto {
  @ApiProperty({ example: 'I went to the store yesterday.' })
  @IsString()
  @IsNotEmpty()
  @Length(1, 2000)
  @Matches(/\S/, { message: 'content must not be blank' })
  content!: string;
}
