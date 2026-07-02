import type { ChatSuggestionType } from './chat.types';

const RESOLUTION_MIN_NEW_USER_MESSAGES = 5;
const SUGGESTION_TYPES: readonly ChatSuggestionType[] = [
  'overused_word',
  'grammar',
  'style',
];

export type ProgressSnapshotInput = {
  userMessageCount: number;
  fingerprints: string[];
  createdAt: Date;
};

export type SuggestionTypeCounts = Record<ChatSuggestionType, number>;

export type WeeklyProgressBucket = {
  weekStart: string;
  raised: number;
  resolved: number;
  raisedByType: SuggestionTypeCounts;
  resolvedByType: SuggestionTypeCounts;
  userMessages: number;
};

function emptyTypeCounts(): SuggestionTypeCounts {
  return { overused_word: 0, grammar: 0, style: 0 };
}

/**
 * Fingerprints are always produced as `${type}:${key}` by fingerprintOf, so
 * the suggestion type can be recovered from the prefix without needing to
 * store it separately on the snapshot.
 */
function typeOfFingerprint(fingerprint: string): ChatSuggestionType | null {
  const prefix = fingerprint.slice(0, fingerprint.indexOf(':'));
  return (SUGGESTION_TYPES as string[]).includes(prefix)
    ? (prefix as ChatSuggestionType)
    : null;
}

/**
 * Monday-start, UTC ISO week bucket for a given instant, formatted as
 * YYYY-MM-DD.
 */
export function isoWeekStartUTC(date: Date): string {
  const truncated = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const day = truncated.getUTCDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  truncated.setUTCDate(truncated.getUTCDate() + diffToMonday);
  return truncated.toISOString().slice(0, 10);
}

type MutableBucket = {
  raised: number;
  resolved: number;
  raisedByType: SuggestionTypeCounts;
  resolvedByType: SuggestionTypeCounts;
};

function bucketFor(
  buckets: Map<string, MutableBucket>,
  weekStart: string,
): MutableBucket {
  let bucket = buckets.get(weekStart);
  if (bucket === undefined) {
    bucket = {
      raised: 0,
      resolved: 0,
      raisedByType: emptyTypeCounts(),
      resolvedByType: emptyTypeCounts(),
    };
    buckets.set(weekStart, bucket);
  }
  return bucket;
}

/**
 * Accumulates raised/resolved counts for ONE conversation's
 * chronologically-ordered analysis snapshots into the shared weekly bucket
 * map. Fingerprint lifecycle is tracked independently per conversation:
 *
 *  - "raised": a fingerprint counts once, attributed to the week of the
 *    snapshot where it is first seen. A fingerprint that later disappears
 *    and reappears is NOT raised a second time (first-seen only).
 *  - "resolved": a fingerprint present in snapshot N and absent from
 *    snapshot N+1 counts as resolved, attributed to the week of snapshot
 *    N+1, iff the user sent at least RESOLUTION_MIN_NEW_USER_MESSAGES new
 *    messages between N and N+1 (evidence the user kept talking and the
 *    issue genuinely disappeared, not that analysis simply hasn't rerun).
 *    Each fingerprint resolves at most once per conversation (first
 *    resolution wins) — once resolved it is never re-resolved even if it
 *    reappears and disappears again in a later snapshot pair.
 */
function accumulateConversation(
  snapshots: ProgressSnapshotInput[],
  buckets: Map<string, MutableBucket>,
): void {
  const ordered = [...snapshots].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );

  const seen = new Set<string>();
  for (const snapshot of ordered) {
    const weekStart = isoWeekStartUTC(snapshot.createdAt);
    for (const fingerprint of snapshot.fingerprints) {
      if (seen.has(fingerprint)) continue;
      seen.add(fingerprint);

      const bucket = bucketFor(buckets, weekStart);
      bucket.raised += 1;
      const type = typeOfFingerprint(fingerprint);
      if (type !== null) bucket.raisedByType[type] += 1;
    }
  }

  const resolved = new Set<string>();
  for (let i = 0; i + 1 < ordered.length; i++) {
    const current = ordered[i];
    const next = ordered[i + 1];
    const newUserMessages = next.userMessageCount - current.userMessageCount;
    if (newUserMessages < RESOLUTION_MIN_NEW_USER_MESSAGES) continue;

    const nextFingerprints = new Set(next.fingerprints);
    const weekStart = isoWeekStartUTC(next.createdAt);

    for (const fingerprint of current.fingerprints) {
      if (nextFingerprints.has(fingerprint)) continue;
      if (resolved.has(fingerprint)) continue;
      resolved.add(fingerprint);

      const bucket = bucketFor(buckets, weekStart);
      bucket.resolved += 1;
      const type = typeOfFingerprint(fingerprint);
      if (type !== null) bucket.resolvedByType[type] += 1;
    }
  }
}

/**
 * Computes weekly raised/resolved buckets across all of a user's
 * conversations, plus the user-message count sent each week (supplied by
 * the caller from ChatMessage rows, independent of snapshot history so
 * that weeks with chat activity but no fingerprint churn still appear).
 */
export function computeWeeklyProgress(
  conversationsSnapshots: ProgressSnapshotInput[][],
  userMessagesByWeek: Map<string, number>,
): Map<string, WeeklyProgressBucket> {
  const buckets = new Map<string, MutableBucket>();

  for (const snapshots of conversationsSnapshots) {
    accumulateConversation(snapshots, buckets);
  }
  for (const weekStart of userMessagesByWeek.keys()) {
    bucketFor(buckets, weekStart);
  }

  const result = new Map<string, WeeklyProgressBucket>();
  for (const [weekStart, bucket] of buckets) {
    result.set(weekStart, {
      weekStart,
      raised: bucket.raised,
      resolved: bucket.resolved,
      raisedByType: bucket.raisedByType,
      resolvedByType: bucket.resolvedByType,
      userMessages: userMessagesByWeek.get(weekStart) ?? 0,
    });
  }
  return result;
}
