import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Matches } from 'class-validator';

export const REVIEW_RATINGS = ['again', 'hard', 'good', 'easy'] as const;
export type ReviewRatingInput = (typeof REVIEW_RATINGS)[number];

export const REVIEW_ANSWER_RESULTS = [
  'correct',
  'incorrect',
  'revealed',
] as const;
export type ReviewAnswerResultInput = (typeof REVIEW_ANSWER_RESULTS)[number];

export class GradeCardDto {
  @ApiProperty({ enum: REVIEW_RATINGS, example: 'good' })
  @IsIn(REVIEW_RATINGS)
  rating!: ReviewRatingInput;

  @ApiPropertyOptional({ example: 'come across' })
  @IsOptional()
  @IsString()
  @Matches(/\S/, { message: 'typedAnswer must not be blank' })
  typedAnswer?: string;

  @ApiPropertyOptional({ enum: REVIEW_ANSWER_RESULTS, example: 'correct' })
  @IsOptional()
  @IsIn(REVIEW_ANSWER_RESULTS)
  answerResult?: ReviewAnswerResultInput;
}
