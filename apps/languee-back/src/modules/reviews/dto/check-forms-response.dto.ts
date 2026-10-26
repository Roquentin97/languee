import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RevealedWordDto } from './answer-card-response.dto';

export class FormCheckResultDto {
  @ApiProperty({ example: 'ran' })
  typed!: string;

  @ApiProperty({ example: 'ran' })
  expected!: string;

  @ApiProperty({ example: true })
  correct!: boolean;
}

export class CheckFormsResponseDto {
  @ApiProperty({
    description:
      'Per-form-key feedback for the typed submission, keyed by form name (e.g. "past")',
    example: {
      base: { typed: 'run', expected: 'run', correct: true },
      past: { typed: 'runned', expected: 'ran', correct: false },
    },
  })
  results!: Record<string, FormCheckResultDto>;

  @ApiProperty({ example: false })
  allCorrect!: boolean;

  @ApiPropertyOptional({
    description: 'Word details revealed alongside the per-form feedback',
    type: RevealedWordDto,
  })
  revealed!: RevealedWordDto;
}
