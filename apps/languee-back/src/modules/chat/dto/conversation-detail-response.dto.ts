import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ChatMessageResponseDto } from './chat-message-response.dto';

export class ConversationDetailResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiPropertyOptional({ example: 'Practicing small talk', nullable: true })
  title!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: [ChatMessageResponseDto] })
  messages!: ChatMessageResponseDto[];
}
