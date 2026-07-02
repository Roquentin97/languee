import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ConversationListItemResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiPropertyOptional({ example: 'Practicing small talk', nullable: true })
  title!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;

  @ApiProperty({ example: 4 })
  messageCount!: number;

  @ApiPropertyOptional({
    example: 'I went to the store yesterday.',
    nullable: true,
  })
  lastMessagePreview!: string | null;
}

export class ConversationListResponseDto {
  @ApiProperty({ type: [ConversationListItemResponseDto] })
  conversations!: ConversationListItemResponseDto[];
}
