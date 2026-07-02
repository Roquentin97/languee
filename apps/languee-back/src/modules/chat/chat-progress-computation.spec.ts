import {
  computeWeeklyProgress,
  isoWeekStartUTC,
  type ProgressSnapshotInput,
} from './chat-progress-computation';

function snapshot(
  createdAt: string,
  userMessageCount: number,
  fingerprints: string[],
): ProgressSnapshotInput {
  return { createdAt: new Date(createdAt), userMessageCount, fingerprints };
}

describe('isoWeekStartUTC', () => {
  it('returns the Monday of the same week for a mid-week date', () => {
    // 2026-06-17 is a Wednesday
    expect(isoWeekStartUTC(new Date('2026-06-17T12:00:00.000Z'))).toBe(
      '2026-06-15',
    );
  });

  it('returns the same date for a Monday at midnight UTC', () => {
    expect(isoWeekStartUTC(new Date('2026-06-15T00:00:00.000Z'))).toBe(
      '2026-06-15',
    );
  });

  it('treats a Sunday as belonging to the previous week (boundary case)', () => {
    // 2026-06-21 is a Sunday, one second before the next Monday boundary
    expect(isoWeekStartUTC(new Date('2026-06-21T23:59:59.000Z'))).toBe(
      '2026-06-15',
    );
    // The following instant crosses into the next ISO week
    expect(isoWeekStartUTC(new Date('2026-06-22T00:00:00.000Z'))).toBe(
      '2026-06-22',
    );
  });
});

describe('computeWeeklyProgress', () => {
  it('returns no buckets for a conversation with no snapshots and no messages', () => {
    const buckets = computeWeeklyProgress([[]], new Map());
    expect(buckets.size).toBe(0);
  });

  it('raises a fingerprint in the week of the snapshot where first seen, but does not resolve it without a next snapshot', () => {
    const buckets = computeWeeklyProgress(
      [[snapshot('2026-06-15T00:00:00.000Z', 3, ['overused_word:basically'])]],
      new Map(),
    );

    const bucket = buckets.get('2026-06-15');
    expect(bucket?.raised).toBe(1);
    expect(bucket?.raisedByType.overused_word).toBe(1);
    expect(bucket?.resolved).toBe(0);
  });

  it('does not resolve a fingerprint when fewer than 5 new user messages were sent between snapshots', () => {
    const buckets = computeWeeklyProgress(
      [
        [
          snapshot('2026-06-15T00:00:00.000Z', 3, ['grammar:duplicated_word']),
          snapshot('2026-06-16T00:00:00.000Z', 6, []), // only +3 messages
        ],
      ],
      new Map(),
    );

    const week1 = buckets.get('2026-06-15');
    const week2 = buckets.get('2026-06-16');
    expect(week1?.raised).toBe(1);
    expect(week1?.resolved).toBe(0);
    expect(week2?.resolved ?? 0).toBe(0);
  });

  it('resolves a fingerprint that disappears after at least 5 new user messages, attributed to the later snapshot week', () => {
    const buckets = computeWeeklyProgress(
      [
        [
          snapshot('2026-06-15T00:00:00.000Z', 3, ['grammar:duplicated_word']),
          snapshot('2026-06-22T00:00:00.000Z', 8, []), // +5 messages
        ],
      ],
      new Map(),
    );

    const raisedWeek = buckets.get('2026-06-15');
    const resolvedWeek = buckets.get('2026-06-22');
    expect(raisedWeek?.raised).toBe(1);
    expect(resolvedWeek?.resolved).toBe(1);
    expect(resolvedWeek?.resolvedByType.grammar).toBe(1);
  });

  it('resolves a fingerprint at most once per conversation, even if it reappears and disappears again', () => {
    const buckets = computeWeeklyProgress(
      [
        [
          snapshot('2026-06-01T00:00:00.000Z', 0, ['overused_word:basically']),
          snapshot('2026-06-08T00:00:00.000Z', 5, []), // resolved here (+5)
          snapshot('2026-06-15T00:00:00.000Z', 10, ['overused_word:basically']), // reappears — must NOT count as a second raise
          snapshot('2026-06-22T00:00:00.000Z', 15, []), // disappears again — must NOT resolve a second time
        ],
      ],
      new Map(),
    );

    const totalRaised = [...buckets.values()].reduce(
      (sum, b) => sum + b.raised,
      0,
    );
    const totalResolved = [...buckets.values()].reduce(
      (sum, b) => sum + b.resolved,
      0,
    );

    expect(totalRaised).toBe(1);
    expect(totalResolved).toBe(1);
    expect(buckets.get('2026-06-08')?.resolved).toBe(1);
    expect(buckets.get('2026-06-22')?.resolved ?? 0).toBe(0);
  });

  it('includes weeks that only have user-message activity with zero raised/resolved', () => {
    const userMessagesByWeek = new Map([['2026-06-15', 12]]);
    const buckets = computeWeeklyProgress([], userMessagesByWeek);

    const bucket = buckets.get('2026-06-15');
    expect(bucket?.userMessages).toBe(12);
    expect(bucket?.raised).toBe(0);
    expect(bucket?.resolved).toBe(0);
  });

  it('aggregates fingerprints from independent conversations into shared weekly buckets', () => {
    const buckets = computeWeeklyProgress(
      [
        [snapshot('2026-06-15T00:00:00.000Z', 3, ['style:so'])],
        [snapshot('2026-06-15T01:00:00.000Z', 2, ['style:so'])],
      ],
      new Map(),
    );

    // Same fingerprint text raised independently in two different
    // conversations counts twice — conversations are tracked independently.
    expect(buckets.get('2026-06-15')?.raised).toBe(2);
    expect(buckets.get('2026-06-15')?.raisedByType.style).toBe(2);
  });
});
