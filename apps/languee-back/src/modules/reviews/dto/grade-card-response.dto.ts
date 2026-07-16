import { ApiProperty } from '@nestjs/swagger';

export class GradeCardResponseDto {
  @ApiProperty({ type: String, format: 'date-time' })
  nextDueAt!: Date;

  @ApiProperty({
    example: 6,
    description:
      'Whole days until the card is next due (0 while it is still in learning or relearning steps)',
  })
  intervalDays!: number;

  @ApiProperty({
    enum: ['learning', 'review', 'relearning'],
    example: 'review',
  })
  state!: 'learning' | 'review' | 'relearning';
}
