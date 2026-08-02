import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsObject, IsOptional, IsString, Matches } from 'class-validator';

export const REVIEW_RATINGS = ['again', 'hard', 'good', 'easy'] as const;
export type ReviewRatingInput = (typeof REVIEW_RATINGS)[number];

export const REVIEW_ANSWER_RESULTS = [
  'correct',
  'incorrect',
  'revealed',
] as const;
export type ReviewAnswerResultInput = (typeof REVIEW_ANSWER_RESULTS)[number];

export class GradeCardDto {
  @ApiProperty({
    enum: REVIEW_RATINGS,
    example: 'good',
    description:
      "The learner's self-assessment. Always the FSRS rating, for every card type - `inflection` and `definition` cards are self-rated rather than checked.",
  })
  @IsIn(REVIEW_RATINGS)
  rating!: ReviewRatingInput;

  @ApiPropertyOptional({
    description: 'The typed answer for a `cloze` card',
    example: 'come across',
  })
  @IsOptional()
  @IsString()
  @Matches(/\S/, { message: 'typedAnswer must not be blank' })
  typedAnswer?: string;

  @ApiPropertyOptional({
    description:
      'The typed paradigm forms for an `inflection` card, keyed by form name (e.g. "past"). Kept for feedback and FSRS training data - the rating is always the self-assessment above, never derived from these.',
    example: { base: 'run', past: 'ran', present3sg: 'runs' },
  })
  @IsOptional()
  @IsObject()
  typedForms?: Record<string, string>;

  @ApiPropertyOptional({ enum: REVIEW_ANSWER_RESULTS, example: 'correct' })
  @IsOptional()
  @IsIn(REVIEW_ANSWER_RESULTS)
  answerResult?: ReviewAnswerResultInput;
}
