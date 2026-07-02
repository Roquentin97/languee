import { ApiProperty } from '@nestjs/swagger';

export class PlanResponseDto {
  @ApiProperty({ enum: ['free', 'plus', 'pro'], example: 'plus' })
  tier!: 'free' | 'plus' | 'pro';

  @ApiProperty({ example: 'Plus' })
  name!: string;

  @ApiProperty({ example: 9 })
  priceMonthlyUsd!: number;

  @ApiProperty({
    type: [String],
    example: ['Chat practice with a better model'],
  })
  features!: string[];
}

export class PlansResponseDto {
  @ApiProperty({ type: [PlanResponseDto] })
  plans!: PlanResponseDto[];

  @ApiProperty({
    example: false,
    description: 'Whether a real payment provider is configured',
  })
  billingConfigured!: boolean;
}
