import { ApiProperty } from '@nestjs/swagger';

export class ReviewSummaryResponseDto {
  @ApiProperty({ example: 5 })
  dueCount!: number;

  @ApiProperty({ example: 3 })
  newCount!: number;
}
