import { ApiProperty } from '@nestjs/swagger';

export class SubscriptionResponseDto {
  @ApiProperty({ enum: ['free', 'plus', 'pro'], example: 'free' })
  tier!: 'free' | 'plus' | 'pro';

  @ApiProperty({
    enum: ['active', 'trialing', 'past_due', 'canceled', 'incomplete'],
    example: 'active',
  })
  status!: 'active' | 'trialing' | 'past_due' | 'canceled' | 'incomplete';

  @ApiProperty({ example: null, nullable: true, type: String })
  currentPeriodEnd!: string | null;

  @ApiProperty({
    example: false,
    description: 'Whether a real payment provider is configured',
  })
  billingConfigured!: boolean;
}
