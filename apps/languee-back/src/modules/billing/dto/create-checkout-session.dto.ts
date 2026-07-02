import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export class CreateCheckoutSessionDto {
  @ApiProperty({ enum: ['plus', 'pro'], example: 'plus' })
  @IsIn(['plus', 'pro'], { message: 'TIER_INVALID' })
  tier!: 'plus' | 'pro';
}
