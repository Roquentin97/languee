import type {
  AnswerCheckOutcome,
  FormCheckOutcome,
  GradeOutcome,
  ReviewQueueItem,
  ReviewSummary,
} from '../reviews.types';
import { AnswerCardResponseDto } from '../dto/answer-card-response.dto';
import { CheckFormsResponseDto } from '../dto/check-forms-response.dto';
import { GradeCardResponseDto } from '../dto/grade-card-response.dto';
import {
  ReviewQueueItemResponseDto,
  ReviewQueueResponseDto,
} from '../dto/review-queue-response.dto';
import { ReviewSummaryResponseDto } from '../dto/review-summary-response.dto';

export function serializeSummary(
  summary: ReviewSummary,
): ReviewSummaryResponseDto {
  return { dueCount: summary.dueCount, newCount: summary.newCount };
}

function serializeQueueItem(item: ReviewQueueItem): ReviewQueueItemResponseDto {
  return {
    cardId: item.cardId,
    type: item.type,
    decks: item.decks,
    isNew: item.isNew,
    cloze: item.cloze,
    inflection: item.inflection,
    definition: item.definition,
  };
}

export function serializeQueue(
  items: ReviewQueueItem[],
): ReviewQueueResponseDto {
  return { items: items.map(serializeQueueItem) };
}

export function serializeAnswerResult(
  outcome: AnswerCheckOutcome,
): AnswerCardResponseDto {
  return {
    result: outcome.result,
    matchedForm: outcome.matchedForm,
    revealed: outcome.revealed
      ? {
          lemma: outcome.revealed.lemma,
          ipa: outcome.revealed.ipa,
          inflectionForms: outcome.revealed.inflectionForms,
        }
      : null,
  };
}

export function serializeFormCheckResult(
  outcome: FormCheckOutcome,
): CheckFormsResponseDto {
  return {
    results: outcome.results,
    allCorrect: outcome.allCorrect,
    revealed: {
      lemma: outcome.revealed.lemma,
      ipa: outcome.revealed.ipa,
      inflectionForms: outcome.revealed.inflectionForms,
    },
  };
}

export function serializeGradeResult(
  result: GradeOutcome,
): GradeCardResponseDto {
  return {
    nextDueAt: result.nextDueAt,
    intervalDays: result.intervalDays,
    state: result.state as 'learning' | 'review' | 'relearning',
  };
}
