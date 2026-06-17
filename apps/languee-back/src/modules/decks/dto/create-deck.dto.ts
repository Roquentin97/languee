import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class CreateDeckDto {
  @ApiProperty({ example: 'English basics' })
  @IsString()
  @IsNotEmpty()
  name!: string;
}
