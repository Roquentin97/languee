import { ApiProperty } from '@nestjs/swagger';

export class CheckoutSessionResponseDto {
  @ApiProperty({ example: 'https://checkout.stripe.com/c/pay/cs_test_123' })
  url!: string;

  @ApiProperty({ example: 'cs_test_123' })
  sessionId!: string;
}
