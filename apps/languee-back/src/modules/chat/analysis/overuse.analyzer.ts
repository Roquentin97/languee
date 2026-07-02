import { STOPWORDS } from './stopwords';
import { tokenizeWords } from './tokenize';

export type OveruseCandidate = {
  word: string;
  count: number;
  ratio: number;
};

const MIN_COUNT = 3;
const MIN_RATIO = 0.04;
const MIN_WORD_LENGTH = 4;
const MAX_CANDIDATES = 5;

/**
 * Frequency of non-stopword tokens (length >= 4) across all user messages.
 * `ratio` is count / totalTokens, where totalTokens is the total number of
 * tokens across all user messages (including stopwords and short words) —
 * i.e. how much of everything the user said is made up of this one word.
 * Flags a word when count >= 3 AND ratio >= 0.04. Returns at most 5
 * candidates ordered by count descending.
 */
export function analyzeOveruse(userMessages: string[]): OveruseCandidate[] {
  const allTokens = userMessages.flatMap(tokenizeWords);
  const totalTokens = allTokens.length;
  if (totalTokens === 0) return [];

  const counts = new Map<string, number>();
  for (const token of allTokens) {
    if (token.length < MIN_WORD_LENGTH) continue;
    if (STOPWORDS.has(token)) continue;
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }

  const candidates: OveruseCandidate[] = [];
  for (const [word, count] of counts) {
    const ratio = count / totalTokens;
    if (count >= MIN_COUNT && ratio >= MIN_RATIO) {
      candidates.push({ word, count, ratio });
    }
  }

  candidates.sort((a, b) => b.count - a.count);
  return candidates.slice(0, MAX_CANDIDATES);
}
