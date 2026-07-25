import { MS_PER_DAY } from '../../core/time/time.constants';
import {
  NEW_CARD_SCHEDULING_STATE,
  scheduleReview,
  type ReviewSchedulingState,
} from './scheduler';

const now = new Date('2026-07-16T10:00:00.000Z');

const matureCard: ReviewSchedulingState = {
  state: 'review',
  stability: 20,
  difficulty: 5,
  scheduledDays: 15,
  learningSteps: 0,
  reps: 8,
  lapses: 1,
  lastReviewedAt: new Date('2026-07-01T10:00:00.000Z'),
};

describe('scheduleReview', () => {
  it('keeps a newly seen card in learning with a sub-day step', () => {
    const result = scheduleReview(NEW_CARD_SCHEDULING_STATE, 'good', now);

    expect(result.state).toBe('learning');
    expect(result.scheduledDays).toBe(0);
    expect(result.dueAt.getTime() - now.getTime()).toBeLessThan(MS_PER_DAY);
    expect(result.reps).toBe(1);
  });

  it('promotes a new card straight to review when it is rated easy', () => {
    const result = scheduleReview(NEW_CARD_SCHEDULING_STATE, 'easy', now);

    expect(result.state).toBe('review');
    expect(result.scheduledDays).toBeGreaterThan(0);
    expect(result.dueAt.getTime() - now.getTime()).toBeGreaterThanOrEqual(
      MS_PER_DAY,
    );
  });

  it('lapses a forgotten review card into relearning and counts the lapse', () => {
    const result = scheduleReview(matureCard, 'again', now);

    expect(result.state).toBe('relearning');
    expect(result.lapses).toBe(matureCard.lapses + 1);
    expect(result.scheduledDays).toBe(0);
    expect(result.stability).toBeLessThan(matureCard.stability);
  });

  it('does not count a lapse when a card that never left learning is forgotten', () => {
    const result = scheduleReview(NEW_CARD_SCHEDULING_STATE, 'again', now);

    expect(result.state).toBe('learning');
    expect(result.lapses).toBe(0);
  });

  it('schedules harder ratings sooner than easier ones', () => {
    const hard = scheduleReview(matureCard, 'hard', now);
    const good = scheduleReview(matureCard, 'good', now);
    const easy = scheduleReview(matureCard, 'easy', now);

    expect(hard.scheduledDays).toBeLessThan(good.scheduledDays);
    expect(good.scheduledDays).toBeLessThan(easy.scheduledDays);
    expect(hard.difficulty).toBeGreaterThan(easy.difficulty);
  });

  it('grows the interval of a card that is recalled correctly', () => {
    const result = scheduleReview(matureCard, 'good', now);

    expect(result.state).toBe('review');
    expect(result.scheduledDays).toBeGreaterThan(matureCard.scheduledDays);
    expect(result.stability).toBeGreaterThan(matureCard.stability);
    expect(result.lastReviewedAt).toEqual(now);
  });

  it('accepts its own output as input, so a persisted card reschedules cleanly', () => {
    const first = scheduleReview(NEW_CARD_SCHEDULING_STATE, 'easy', now);
    const later = new Date(first.dueAt.getTime());
    const second = scheduleReview(first, 'good', later);

    expect(second.state).toBe('review');
    expect(second.reps).toBe(first.reps + 1);
    expect(second.dueAt.getTime()).toBeGreaterThan(later.getTime());
  });

  it('reschedules a relearning card back into review once it is recalled', () => {
    const lapsed = scheduleReview(matureCard, 'again', now);
    const recovered = scheduleReview(
      lapsed,
      'good',
      new Date(lapsed.dueAt.getTime()),
    );

    expect(lapsed.state).toBe('relearning');
    expect(recovered.state).toBe('review');
  });

  it('is deterministic for a given rating and clock', () => {
    expect(scheduleReview(matureCard, 'good', now)).toEqual(
      scheduleReview(matureCard, 'good', now),
    );
  });
});
