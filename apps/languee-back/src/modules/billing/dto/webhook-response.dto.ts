import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class WebhookResponseDto {
  @ApiProperty({ example: true })
  received!: true;

  @ApiPropertyOptional({ example: true })
  duplicate?: true;
}
