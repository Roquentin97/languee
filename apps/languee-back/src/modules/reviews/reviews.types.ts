import type {
  ReviewCardState,
  ReviewRating,
  ReviewAnswerResult,
} from '@prisma/client';

export type ReviewSummary = {
  dueCount: number;
  newCount: number;
};

export type ReviewPrompt = {
  definition: string;
  example: string | null;
  contextMasked: string | null;
  partOfSpeech: string;
  kind: string;
  lemmaLength: number;
};

export type ReviewQueueItem = {
  cardId: string;
  deckId: string;
  deckName: string;
  isNew: boolean;
  prompt: ReviewPrompt;
};

export type AnswerCheckOutcome = {
  result: 'correct' | 'close_synonym' | 'incorrect';
  matchedForm: string | null;
  hint: string | null;
};

export type GradeInput = {
  rating: ReviewRating;
  typedAnswer?: string;
  answerResult?: ReviewAnswerResult;
};

export type GradeOutcome = {
  nextDueAt: Date;
  intervalDays: number;
  state: ReviewCardState;
};
