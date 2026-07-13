import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AnswerCardResponseDto {
  @ApiProperty({
    enum: ['correct', 'incorrect'],
    example: 'correct',
  })
  result!: 'correct' | 'incorrect';

  @ApiPropertyOptional({
    description: 'The accepted form as stored, only present when correct',
    example: 'come across',
    nullable: true,
  })
  matchedForm!: string | null;
}
