import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID, Matches } from 'class-validator';

export class ReviewQueueQueryDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Filter the queue to a single deck',
    example: '1db3f769-e154-44c6-9b98-87de1037a395',
  })
  @IsUUID()
  @IsOptional()
  deckId?: string;

  @ApiPropertyOptional({
    type: Number,
    default: 20,
    minimum: 1,
    maximum: 100,
    description: 'Max items to return. Defaults to 20, capped at 100.',
    example: '20',
  })
  @Matches(/^\d+$/, { message: 'limit must be a positive integer' })
  @IsOptional()
  limit?: string;
}
