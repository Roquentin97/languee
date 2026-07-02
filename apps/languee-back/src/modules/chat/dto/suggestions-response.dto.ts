import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ChatSuggestionResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: ['overused_word', 'grammar', 'style'] })
  type!: 'overused_word' | 'grammar' | 'style';

  @ApiProperty({ example: 'You used "basically" 5 times' })
  title!: string;

  @ApiProperty({ example: 'Consider varying your word choice.' })
  detail!: string;

  @ApiPropertyOptional({ type: Object, nullable: true })
  payload!: Record<string, unknown> | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;
}

export class SuggestionsResponseDto {
  @ApiProperty({ type: [ChatSuggestionResponseDto] })
  suggestions!: ChatSuggestionResponseDto[];

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  analyzedAt!: Date | null;
}
