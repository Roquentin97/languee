import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';

export class ListCardsQueryDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Filter cards by deck ID',
    example: '1db3f769-e154-44c6-9b98-87de1037a395',
  })
  @IsUUID()
  @IsOptional()
  deckId?: string;

  @ApiPropertyOptional({
    enum: ['none', 'pending', 'completed', 'failed'],
    description:
      'Filter cards by AnkiDroid export status. Use "none" to return cards without any export.',
    example: 'pending',
  })
  @IsIn(['none', 'pending', 'completed', 'failed'])
  @IsOptional()
  ankiDroidExportStatus?: 'none' | 'pending' | 'completed' | 'failed';

  @ApiPropertyOptional({
    description: 'Filter cards by AnkiDroid export failure reason',
    example: 'DECK_NOT_FOUND',
  })
  @IsString()
  @IsOptional()
  failureReason?: string;
}
