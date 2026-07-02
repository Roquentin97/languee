import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length } from 'class-validator';

export class CreateConversationDto {
  @ApiPropertyOptional({ example: 'Practicing small talk' })
  @IsOptional()
  @IsString()
  @Length(1, 80)
  title?: string;
}
