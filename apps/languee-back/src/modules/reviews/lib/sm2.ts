import type { ReviewCardState, ReviewRating } from '@prisma/client';

/**
 * Pure SM-2 variant scheduler. Takes the card's current review state and a
 * rating and returns the next state. The clock is injected via `now` so the
 * function is deterministic and testable.
 */

export const MIN_EASE_FACTOR = 1.3;

const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 24 * 60 * MS_PER_MINUTE;
const RELEARNING_MINUTES = 10;

export interface Sm2Input {
  state: ReviewCardState;
  intervalDays: number;
  easeFactor: number;
  repetitions: number;
  lapses: number;
  rating: ReviewRating;
  now: Date;
}

export interface Sm2Output {
  state: ReviewCardState;
  intervalDays: number;
  easeFactor: number;
  repetitions: number;
  lapses: number;
  dueAt: Date;
}

export function scheduleReview(input: Sm2Input): Sm2Output {
  const {
    rating,
    now,
    intervalDays: prevInterval,
    easeFactor: prevEase,
  } = input;
  const prevRepetitions = input.repetitions;

  if (rating === 'again') {
    return {
      state: 'learning',
      intervalDays: 0,
      easeFactor: Math.max(MIN_EASE_FACTOR, prevEase - 0.2),
      repetitions: 0,
      lapses: input.state === 'review' ? input.lapses + 1 : input.lapses,
      dueAt: new Date(now.getTime() + RELEARNING_MINUTES * MS_PER_MINUTE),
    };
  }

  if (rating === 'hard') {
    const newInterval =
      prevRepetitions > 0 ? Math.max(1, Math.round(prevInterval * 1.2)) : 1;
    return {
      state: 'review',
      intervalDays: newInterval,
      easeFactor: Math.max(MIN_EASE_FACTOR, prevEase - 0.15),
      repetitions: prevRepetitions + 1,
      lapses: input.lapses,
      dueAt: new Date(now.getTime() + newInterval * MS_PER_DAY),
    };
  }

  if (rating === 'good') {
    const newInterval =
      prevRepetitions === 0
        ? 1
        : prevRepetitions === 1
          ? 6
          : Math.round(prevInterval * prevEase);
    return {
      state: 'review',
      intervalDays: newInterval,
      easeFactor: prevEase,
      repetitions: prevRepetitions + 1,
      lapses: input.lapses,
      dueAt: new Date(now.getTime() + newInterval * MS_PER_DAY),
    };
  }

  // easy
  const newEase = prevEase + 0.15;
  const newInterval =
    prevRepetitions === 0
      ? 4
      : Math.max(1, Math.round(prevInterval * newEase * 1.3));
  return {
    state: 'review',
    intervalDays: newInterval,
    easeFactor: newEase,
    repetitions: prevRepetitions + 1,
    lapses: input.lapses,
    dueAt: new Date(now.getTime() + newInterval * MS_PER_DAY),
  };
}
