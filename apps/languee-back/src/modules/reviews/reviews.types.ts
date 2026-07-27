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
  maskedSentence: string | null;
  partOfSpeech: string;
  kind: string;
  lemmaLength: number;
  language: string;
};

export type ReviewQueueItem = {
  cardId: string;
  deckId: string;
  deckName: string;
  isNew: boolean;
  prompt: ReviewPrompt;
};

/**
 * Word data revealed to the learner once the card has been answered
 * correctly. Never sent while the answer is still hidden.
 */
export type RevealedWordInfo = {
  lemma: string;
  ipa: string | null;
  inflectionForms: Record<string, string> | null;
};

export type AnswerCheckOutcome = {
  result: 'correct' | 'incorrect';
  matchedForm: string | null;
  revealed: RevealedWordInfo | null;
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
