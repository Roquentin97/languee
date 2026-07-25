import type { ReviewCardState, ReviewRating } from '@prisma/client';
import {
  createEmptyCard,
  fsrs,
  Rating,
  State,
  type Card as FsrsCard,
  type Grade,
} from 'ts-fsrs';

/**
 * Review scheduler, backed by FSRS. Takes the card's persisted scheduling state
 * and a rating and returns the next state. The clock is injected via `now` so
 * the function is deterministic and testable.
 */

/**
 * Fuzz spreads intervals randomly to stop cards clustering on the same day. It
 * would make scheduling non-reproducible for a given (state, rating, now), so
 * it stays off until we have a seeding strategy we can pin in tests.
 */
const scheduler = fsrs({ enable_fuzz: false });

/** The subset of a persisted card row that FSRS reads. */
export interface ReviewSchedulingState {
  state: ReviewCardState;
  stability: number;
  difficulty: number;
  scheduledDays: number;
  learningSteps: number;
  reps: number;
  lapses: number;
  lastReviewedAt: Date | null;
}

export interface ScheduledReview extends ReviewSchedulingState {
  dueAt: Date;
}

/** Mirrors ts-fsrs `createEmptyCard`, for cards with no review row yet. */
export const NEW_CARD_SCHEDULING_STATE: ReviewSchedulingState = {
  state: 'new',
  stability: 0,
  difficulty: 0,
  scheduledDays: 0,
  learningSteps: 0,
  reps: 0,
  lapses: 0,
  lastReviewedAt: null,
};

const RATING_TO_GRADE: Record<ReviewRating, Grade> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
};

const STATE_TO_FSRS: Record<ReviewCardState, State> = {
  new: State.New,
  learning: State.Learning,
  review: State.Review,
  relearning: State.Relearning,
};

const FSRS_TO_STATE: Record<State, ReviewCardState> = {
  [State.New]: 'new',
  [State.Learning]: 'learning',
  [State.Review]: 'review',
  [State.Relearning]: 'relearning',
};

function toFsrsCard(current: ReviewSchedulingState, now: Date): FsrsCard {
  if (current.state === 'new') {
    return createEmptyCard(now);
  }
  return {
    stability: current.stability,
    difficulty: current.difficulty,
    scheduled_days: current.scheduledDays,
    learning_steps: current.learningSteps,
    reps: current.reps,
    lapses: current.lapses,
    state: STATE_TO_FSRS[current.state],
    last_review: current.lastReviewedAt ?? undefined,
    // `due` and `elapsed_days` are required by the Card type but are outputs on
    // this path, not inputs: the scheduler derives elapsed days from
    // `last_review` and `now`, and overwrites both before returning.
    due: now,
    elapsed_days: 0,
  };
}

export function scheduleReview(
  current: ReviewSchedulingState,
  rating: ReviewRating,
  now: Date,
): ScheduledReview {
  const { card } = scheduler.next(
    toFsrsCard(current, now),
    now,
    RATING_TO_GRADE[rating],
  );

  return {
    state: FSRS_TO_STATE[card.state],
    stability: card.stability,
    difficulty: card.difficulty,
    scheduledDays: card.scheduled_days,
    learningSteps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    lastReviewedAt: now,
    dueAt: card.due,
  };
}
