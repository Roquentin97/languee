import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateConversationResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiPropertyOptional({ example: 'Practicing small talk', nullable: true })
  title!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;

  @ApiProperty({ example: 0 })
  messageCount!: number;
}
