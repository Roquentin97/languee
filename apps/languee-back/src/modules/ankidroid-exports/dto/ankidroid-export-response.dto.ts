import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AnkiDroidExportResponseDto {
  @ApiProperty({ example: 'export_123' })
  id!: string;

  @ApiProperty({ example: 'card_123' })
  cardId!: string;

  @ApiProperty({ enum: ['pending', 'completed', 'failed'], example: 'pending' })
  status!: string;

  @ApiPropertyOptional({ example: 'DECK_NOT_FOUND', nullable: true })
  failureReason!: string | null;

  @ApiPropertyOptional({
    example: 'The target AnkiDroid deck could not be found',
    nullable: true,
  })
  failureMessage!: string | null;

  @ApiPropertyOptional({ example: '1234567890', nullable: true })
  ankiNoteId!: string | null;

  @ApiPropertyOptional({ example: '9876543210', nullable: true })
  ankiDeckId!: string | null;

  @ApiPropertyOptional({ example: 'English Vocabulary', nullable: true })
  ankiDeckNameSnapshot!: string | null;

  @ApiPropertyOptional({ example: '1122334455', nullable: true })
  ankiModelId!: string | null;

  @ApiPropertyOptional({ example: 'Basic', nullable: true })
  ankiModelNameSnapshot!: string | null;

  @ApiPropertyOptional({ example: '1.0.0', nullable: true })
  templateVersion!: string | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  lastAttemptedAt!: Date | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  completedAt!: Date | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}
