import type {
  CardType,
  ReviewCardState,
  ReviewRating,
  ReviewAnswerResult,
} from '@prisma/client';

export type ReviewSummary = {
  dueCount: number;
  newCount: number;
};

export type DeckRef = { id: string; name: string };

/** `existing` card prompt: masked-sentence, type-in-the-word. */
export type ExistingCardPayload = {
  definition: string;
  maskedSentence: string | null;
  partOfSpeech: string;
  kind: string;
  lemmaLength: number;
  language: string;
};

/**
 * `inflection` card prompt: the paradigm to type out. `formKeys` names which
 * forms exist (e.g. `["base","past","present3sg"]`) without revealing their
 * values - those are only returned by the check-forms endpoint after the
 * learner submits an attempt.
 */
export type InflectionCardPayload = {
  lemma: string;
  partOfSpeech: string;
  kind: string;
  language: string;
  formKeys: string[];
};

/**
 * `definition` card prompt: lemma + part of speech, recall the meaning.
 * Hints never affect scheduling (grading is always self-assessed).
 */
export type DefinitionCardPayload = {
  lemma: string;
  partOfSpeech: string;
  kind: string;
  language: string;
  /** Glosses of the learner's other saved senses of the lemma, only present with >=2 saved senses. */
  hint1: string[] | null;
  /** The lemma in context: captured sentence, else the dictionary example. */
  hint2: string | null;
};

export type ReviewQueueItem = {
  cardId: string;
  type: CardType;
  decks: DeckRef[];
  isNew: boolean;
  existing: ExistingCardPayload | null;
  inflection: InflectionCardPayload | null;
  definition: DefinitionCardPayload | null;
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

export type FormCheckResultEntry = {
  typed: string;
  expected: string;
  correct: boolean;
};

export type FormCheckOutcome = {
  results: Record<string, FormCheckResultEntry>;
  allCorrect: boolean;
  revealed: RevealedWordInfo;
};

export type GradeInput = {
  rating: ReviewRating;
  typedAnswer?: string;
  /** Inflection-card typed forms, kept for feedback and FSRS training data. */
  typedForms?: Record<string, string>;
  answerResult?: ReviewAnswerResult;
};

export type GradeOutcome = {
  nextDueAt: Date;
  intervalDays: number;
  state: ReviewCardState;
};
