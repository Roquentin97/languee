import { ApiProperty } from '@nestjs/swagger';

export class ChatMessageResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: ['user', 'assistant'] })
  role!: 'user' | 'assistant';

  @ApiProperty({ example: 'I went to the store yesterday.' })
  content!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;
}
