/**
 * Splits text into sentences on a terminal punctuation mark (./!/?) followed
 * by whitespace. This is a simple heuristic (no abbreviation handling) that
 * is sufficient for the grammar and style analyzers, and is also what makes
 * "duplicated word across a sentence boundary" or "repeated phrase across a
 * sentence boundary" NOT get flagged — each sentence is analyzed in
 * isolation.
 */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

const MAX_EXCERPT_LENGTH = 80;

export function truncateExcerpt(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > MAX_EXCERPT_LENGTH
    ? `${trimmed.slice(0, MAX_EXCERPT_LENGTH - 1)}…`
    : trimmed;
}
