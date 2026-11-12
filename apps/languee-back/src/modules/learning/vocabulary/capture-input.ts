export const MAX_CAPTURE_TEXT_BYTES = 1024;
export const MAX_CAPTURE_MEANINGFUL_WORDS = 15;

// This list is deliberately explicit. Android uses the same list and Unicode
// token rules so client-side guidance cannot disagree with server validation.
const ENGLISH_FUNCTION_WORDS = new Set([
  'a',
  'about',
  'above',
  'after',
  'again',
  'against',
  'all',
  'am',
  'an',
  'and',
  'any',
  'are',
  'aren',
  'as',
  'at',
  'be',
  'because',
  'been',
  'before',
  'being',
  'below',
  'between',
  'both',
  'but',
  'by',
  'can',
  'could',
  'did',
  'do',
  'does',
  'doing',
  'down',
  'during',
  'each',
  'few',
  'for',
  'from',
  'further',
  'had',
  'has',
  'have',
  'having',
  'he',
  'her',
  'here',
  'hers',
  'herself',
  'him',
  'himself',
  'his',
  'how',
  'i',
  'if',
  'in',
  'into',
  'is',
  'it',
  'its',
  'itself',
  'just',
  'me',
  'more',
  'most',
  'my',
  'myself',
  'no',
  'nor',
  'not',
  'now',
  'of',
  'off',
  'on',
  'once',
  'only',
  'or',
  'other',
  'our',
  'ours',
  'ourselves',
  'out',
  'over',
  'own',
  'same',
  'she',
  'should',
  'so',
  'some',
  'such',
  'than',
  'that',
  'the',
  'their',
  'theirs',
  'them',
  'themselves',
  'then',
  'there',
  'these',
  'they',
  'this',
  'those',
  'through',
  'to',
  'too',
  'under',
  'until',
  'up',
  'very',
  'was',
  'we',
  'were',
  'what',
  'when',
  'where',
  'which',
  'while',
  'who',
  'whom',
  'why',
  'will',
  'with',
  'would',
  'you',
  'your',
  'yours',
  'yourself',
  'yourselves',
  'ain',
  'aren',
  'couldn',
  'didn',
  'doesn',
  'don',
  'hadn',
  'hasn',
  'haven',
  'isn',
  'mightn',
  'mustn',
  'needn',
  'shan',
  'shouldn',
  'wasn',
  'weren',
  'won',
  'wouldn',
  't',
  's',
  'd',
  'll',
  're',
  've',
  'm',
]);

export function normalizedSurfaceTokens(text: string): string[] {
  const normalized = text.normalize('NFC').toLocaleLowerCase('en-US');
  return normalized.match(/[\p{L}\p{M}]+/gu) ?? [];
}

export function distinctSurfaceTokens(text: string): string[] {
  return [...new Set(normalizedSurfaceTokens(text))];
}

export function meaningfulWordCount(text: string): number {
  return new Set(
    normalizedSurfaceTokens(text).filter(
      (token) => !ENGLISH_FUNCTION_WORDS.has(token),
    ),
  ).size;
}

export function captureInputError(text: string): string | null {
  if (Buffer.byteLength(text, 'utf8') > MAX_CAPTURE_TEXT_BYTES) {
    return 'CAPTURE_TEXT_TOO_LONG';
  }
  if (meaningfulWordCount(text) > MAX_CAPTURE_MEANINGFUL_WORDS) {
    return 'CAPTURE_TOO_MANY_MEANINGFUL_WORDS';
  }
  return null;
}

export function contextInputError(context: string | undefined): string | null {
  return context !== undefined &&
    Buffer.byteLength(context, 'utf8') > MAX_CAPTURE_TEXT_BYTES
    ? 'CONTEXT_TOO_LONG'
    : null;
}
