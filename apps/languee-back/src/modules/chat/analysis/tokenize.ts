/**
 * Lowercases and splits text into word tokens on any non-letter character,
 * keeping apostrophes that appear inside a word (e.g. "don't", "isn't").
 * Leading/trailing apostrophes and stray punctuation are dropped.
 */
export function tokenizeWords(text: string): string[] {
  const matches = text.toLowerCase().match(/[a-z]+(?:'[a-z]+)*/g);
  return matches ?? [];
}

/**
 * Same as tokenizeWords but preserves original casing. Used where the
 * original casing of a word matters (e.g. grammar heuristics).
 */
export function tokenizeWordsPreservingCase(text: string): string[] {
  const matches = text.match(/[A-Za-z]+(?:'[A-Za-z]+)*/g);
  return matches ?? [];
}
