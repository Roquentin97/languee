import { MIN_EASE_FACTOR, scheduleReview } from './sm2';
import type { Sm2Input } from './sm2';

const NOW = new Date('2026-01-01T00:00:00.000Z');
const TEN_MINUTES_MS = 10 * 60_000;
const DAY_MS = 24 * 60 * 60_000;

const newCard: Omit<Sm2Input, 'rating' | 'now'> = {
  state: 'new',
  intervalDays: 0,
  easeFactor: 2.5,
  repetitions: 0,
  lapses: 0,
};

const learningCard: Omit<Sm2Input, 'rating' | 'now'> = {
  state: 'learning',
  intervalDays: 0,
  easeFactor: 2.3,
  repetitions: 0,
  lapses: 0,
};

const matureReviewCard: Omit<Sm2Input, 'rating' | 'now'> = {
  state: 'review',
  intervalDays: 10,
  easeFactor: 2.5,
  repetitions: 3,
  lapses: 0,
};

describe('scheduleReview() — again', () => {
  it('new card — resets to learning, 10 minute due offset, ease floor applied, no lapse', () => {
    const result = scheduleReview({ ...newCard, rating: 'again', now: NOW });

    expect(result).toEqual({
      state: 'learning',
      intervalDays: 0,
      easeFactor: 2.3,
      repetitions: 0,
      lapses: 0,
      dueAt: new Date(NOW.getTime() + TEN_MINUTES_MS),
    });
  });

  it('learning card — stays in learning, no lapse increment', () => {
    const result = scheduleReview({
      ...learningCard,
      rating: 'again',
      now: NOW,
    });

    expect(result.state).toBe('learning');
    expect(result.intervalDays).toBe(0);
    expect(result.easeFactor).toBeCloseTo(2.1);
    expect(result.lapses).toBe(0);
    expect(result.dueAt).toEqual(new Date(NOW.getTime() + TEN_MINUTES_MS));
  });

  it('mature review card — lapse increments and repetitions reset', () => {
    const result = scheduleReview({
      ...matureReviewCard,
      rating: 'again',
      now: NOW,
    });

    expect(result.state).toBe('learning');
    expect(result.intervalDays).toBe(0);
    expect(result.repetitions).toBe(0);
    expect(result.lapses).toBe(1);
    expect(result.easeFactor).toBeCloseTo(2.3);
    expect(result.dueAt).toEqual(new Date(NOW.getTime() + TEN_MINUTES_MS));
  });

  it('ease factor never drops below the floor of 1.3', () => {
    const result = scheduleReview({
      ...matureReviewCard,
      easeFactor: 1.35,
      rating: 'again',
      now: NOW,
    });

    expect(result.easeFactor).toBe(MIN_EASE_FACTOR);
  });
});

describe('scheduleReview() — hard', () => {
  it('new card — interval 1 day, ease reduced by 0.15, repetitions increments', () => {
    const result = scheduleReview({ ...newCard, rating: 'hard', now: NOW });

    expect(result).toEqual({
      state: 'review',
      intervalDays: 1,
      easeFactor: 2.35,
      repetitions: 1,
      lapses: 0,
      dueAt: new Date(NOW.getTime() + 1 * DAY_MS),
    });
  });

  it('learning card — interval 1 day since repetitions is 0', () => {
    const result = scheduleReview({
      ...learningCard,
      rating: 'hard',
      now: NOW,
    });

    expect(result.state).toBe('review');
    expect(result.intervalDays).toBe(1);
    expect(result.repetitions).toBe(1);
    expect(result.dueAt).toEqual(new Date(NOW.getTime() + 1 * DAY_MS));
  });

  it('mature review card — interval scales previous interval by 1.2, rounded', () => {
    const result = scheduleReview({
      ...matureReviewCard,
      rating: 'hard',
      now: NOW,
    });

    expect(result.state).toBe('review');
    expect(result.intervalDays).toBe(12); // round(10 * 1.2)
    expect(result.repetitions).toBe(4);
    expect(result.easeFactor).toBeCloseTo(2.35);
    expect(result.dueAt).toEqual(new Date(NOW.getTime() + 12 * DAY_MS));
  });

  it('ease factor never drops below the floor of 1.3', () => {
    const result = scheduleReview({
      ...matureReviewCard,
      easeFactor: 1.4,
      rating: 'hard',
      now: NOW,
    });

    expect(result.easeFactor).toBe(MIN_EASE_FACTOR);
  });

  it('interval is always at least 1 day even for a tiny previous interval', () => {
    const result = scheduleReview({
      ...matureReviewCard,
      intervalDays: 1,
      rating: 'hard',
      now: NOW,
    });

    expect(result.intervalDays).toBeGreaterThanOrEqual(1);
  });
});

describe('scheduleReview() — good', () => {
  it('new card (repetitions 0) — interval of 1 day, ease unchanged', () => {
    const result = scheduleReview({ ...newCard, rating: 'good', now: NOW });

    expect(result).toEqual({
      state: 'review',
      intervalDays: 1,
      easeFactor: 2.5,
      repetitions: 1,
      lapses: 0,
      dueAt: new Date(NOW.getTime() + 1 * DAY_MS),
    });
  });

  it('learning card (repetitions 0) — interval of 1 day', () => {
    const result = scheduleReview({
      ...learningCard,
      rating: 'good',
      now: NOW,
    });

    expect(result.intervalDays).toBe(1);
    expect(result.repetitions).toBe(1);
  });

  it('card with repetitions 1 — interval jumps to 6 days', () => {
    const result = scheduleReview({
      state: 'review',
      intervalDays: 1,
      easeFactor: 2.5,
      repetitions: 1,
      lapses: 0,
      rating: 'good',
      now: NOW,
    });

    expect(result.intervalDays).toBe(6);
    expect(result.repetitions).toBe(2);
  });

  it('mature review card (repetitions >= 2) — interval is previous interval times ease, rounded', () => {
    const result = scheduleReview({
      ...matureReviewCard,
      rating: 'good',
      now: NOW,
    });

    expect(result.state).toBe('review');
    expect(result.intervalDays).toBe(25); // round(10 * 2.5)
    expect(result.repetitions).toBe(4);
    expect(result.easeFactor).toBe(2.5);
    expect(result.dueAt).toEqual(new Date(NOW.getTime() + 25 * DAY_MS));
  });
});

describe('scheduleReview() — easy', () => {
  it('new card (repetitions 0) — interval of 4 days, ease increases by 0.15', () => {
    const result = scheduleReview({ ...newCard, rating: 'easy', now: NOW });

    expect(result).toEqual({
      state: 'review',
      intervalDays: 4,
      easeFactor: 2.65,
      repetitions: 1,
      lapses: 0,
      dueAt: new Date(NOW.getTime() + 4 * DAY_MS),
    });
  });

  it('learning card (repetitions 0) — interval of 4 days', () => {
    const result = scheduleReview({
      ...learningCard,
      rating: 'easy',
      now: NOW,
    });

    expect(result.intervalDays).toBe(4);
    expect(result.easeFactor).toBeCloseTo(2.45);
    expect(result.repetitions).toBe(1);
  });

  it('mature review card — interval is previous interval times new ease times 1.3, rounded', () => {
    const result = scheduleReview({
      ...matureReviewCard,
      rating: 'easy',
      now: NOW,
    });

    expect(result.state).toBe('review');
    expect(result.easeFactor).toBeCloseTo(2.65);
    expect(result.intervalDays).toBe(34); // round(10 * 2.65 * 1.3) = round(34.45)
    expect(result.repetitions).toBe(4);
    expect(result.dueAt).toEqual(new Date(NOW.getTime() + 34 * DAY_MS));
  });
});

describe('scheduleReview() — integer intervals', () => {
  it('every rating produces an integer-valued intervalDays', () => {
    const ratings = ['again', 'hard', 'good', 'easy'] as const;
    for (const rating of ratings) {
      const result = scheduleReview({
        ...matureReviewCard,
        intervalDays: 7,
        rating,
        now: NOW,
      });
      expect(Number.isInteger(result.intervalDays)).toBe(true);
    }
  });
});
