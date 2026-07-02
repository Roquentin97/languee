import { ApiProperty } from '@nestjs/swagger';

export class GradeCardResponseDto {
  @ApiProperty({ type: String, format: 'date-time' })
  nextDueAt!: Date;

  @ApiProperty({
    example: 6,
    description: 'Integer-valued interval in days (0 for relearning)',
  })
  intervalDays!: number;

  @ApiProperty({ enum: ['learning', 'review'], example: 'review' })
  state!: 'learning' | 'review';
}
