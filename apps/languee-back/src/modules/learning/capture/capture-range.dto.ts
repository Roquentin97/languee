import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

export class CaptureRangeDto {
  @ApiProperty({ example: 4, minimum: 0 })
  @IsInt()
  @Min(0)
  start!: number;

  @ApiProperty({ example: 7, minimum: 0 })
  @IsInt()
  @Min(0)
  end!: number;
}
