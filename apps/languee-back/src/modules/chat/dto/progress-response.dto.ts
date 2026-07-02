import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ProgressTotalsResponseDto {
  @ApiProperty({ example: 12 })
  suggestionsRaised!: number;

  @ApiProperty({ example: 7 })
  suggestionsResolved!: number;

  @ApiPropertyOptional({ type: Number, nullable: true, example: 0.58 })
  resolutionRate!: number | null;

  @ApiProperty({ example: 140 })
  userMessages!: number;

  @ApiProperty({ example: 3 })
  activeConversations!: number;
}

export class ProgressByTypeResponseDto {
  @ApiProperty({ enum: ['overused_word', 'grammar', 'style'] })
  type!: 'overused_word' | 'grammar' | 'style';

  @ApiProperty({ example: 5 })
  raised!: number;

  @ApiProperty({ example: 3 })
  resolved!: number;
}

export class ProgressWeekResponseDto {
  @ApiProperty({ type: String, format: 'date', example: '2026-06-15' })
  weekStart!: string;

  @ApiProperty({ example: 4 })
  raised!: number;

  @ApiProperty({ example: 1 })
  resolved!: number;

  @ApiProperty({ example: 30 })
  userMessages!: number;
}

export class ProgressResponseDto {
  @ApiProperty({ type: ProgressTotalsResponseDto })
  totals!: ProgressTotalsResponseDto;

  @ApiProperty({ type: [ProgressByTypeResponseDto] })
  byType!: ProgressByTypeResponseDto[];

  @ApiProperty({ type: [ProgressWeekResponseDto] })
  weeks!: ProgressWeekResponseDto[];

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  computedAt!: Date | null;
}
