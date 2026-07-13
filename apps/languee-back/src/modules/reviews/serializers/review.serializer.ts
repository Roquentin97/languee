import type {
  AnswerCheckOutcome,
  GradeOutcome,
  ReviewQueueItem,
  ReviewSummary,
} from '../reviews.types';
import { AnswerCardResponseDto } from '../dto/answer-card-response.dto';
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
    deckId: item.deckId,
    deckName: item.deckName,
    isNew: item.isNew,
    prompt: {
      definition: item.prompt.definition,
      example: item.prompt.example,
      contextMasked: item.prompt.contextMasked,
      partOfSpeech: item.prompt.partOfSpeech,
      kind: item.prompt.kind,
      lemmaLength: item.prompt.lemmaLength,
      language: item.prompt.language,
    },
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
  };
}

export function serializeGradeResult(
  result: GradeOutcome,
): GradeCardResponseDto {
  return {
    nextDueAt: result.nextDueAt,
    intervalDays: result.intervalDays,
    state: result.state as 'learning' | 'review',
  };
}
