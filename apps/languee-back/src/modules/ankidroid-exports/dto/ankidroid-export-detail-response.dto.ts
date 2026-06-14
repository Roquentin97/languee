import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AnkiDroidExportResponseDto } from './ankidroid-export-response.dto';

export class AnkiDroidExportAttemptResponseDto {
  @ApiProperty({ example: 'attempt_123' })
  id!: string;

  @ApiProperty({ example: 'export_123' })
  exportId!: string;

  @ApiProperty({
    enum: ['pending', 'completed', 'failed'],
    example: 'completed',
  })
  status!: string;

  @ApiPropertyOptional({ example: 'DECK_NOT_FOUND', nullable: true })
  failureReason!: string | null;

  @ApiPropertyOptional({
    example: 'The target AnkiDroid deck could not be found',
    nullable: true,
  })
  failureMessage!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  attemptedAt!: Date;
}

export class AnkiDroidExportDetailResponseDto extends AnkiDroidExportResponseDto {
  @ApiProperty({ type: [AnkiDroidExportAttemptResponseDto] })
  attempts!: AnkiDroidExportAttemptResponseDto[];
}
