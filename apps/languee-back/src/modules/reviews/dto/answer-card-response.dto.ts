import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AnswerCardResponseDto {
  @ApiProperty({
    enum: ['correct', 'close_synonym', 'incorrect'],
    example: 'correct',
  })
  result!: 'correct' | 'close_synonym' | 'incorrect';

  @ApiPropertyOptional({
    description: 'The accepted form as stored, only present when correct',
    example: 'come across',
    nullable: true,
  })
  matchedForm!: string | null;

  @ApiPropertyOptional({
    description: 'Guidance shown for a close_synonym result',
    nullable: true,
  })
  hint!: string | null;
}
