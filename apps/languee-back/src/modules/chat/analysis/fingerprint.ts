import type { ChatSuggestionType } from '../chat.types';

export type FingerprintableSuggestion = {
  type: ChatSuggestionType;
  title: string;
  payload: Record<string, unknown> | null | undefined;
};

/**
 * Deterministic, lowercase identity for a suggestion's underlying issue,
 * used to track whether the user has acted on it across analysis runs.
 *
 * `overused_word` and `grammar` each carry a single stable payload field
 * (`word`, `rule`) that identifies the issue independent of the specific
 * sentence it appeared in — grammar in particular fingerprints by rule only
 * (not by word/excerpt), so e.g. every `duplicated_word` finding collapses
 * into one fingerprint regardless of which word was duplicated. This is
 * intentional: the feature tracks whether the user stops making a *kind* of
 * mistake, not whether one exact occurrence disappears.
 *
 * `style` findings do not share a single payload shape across patterns
 * (see style.analyzer.ts): `repeated_sentence_starter` payloads carry
 * `word`, `repeated_phrase` payloads carry `phrase`, and `long_sentence`
 * payloads carry only `wordCount`/`excerpt` with no pattern-level
 * identifier. We key on the most stable field available, in this order:
 *   1. `payload.phrase` — repeated_phrase, semantic identifier
 *   2. `payload.word` — repeated_sentence_starter, semantic identifier
 *   3. `payload.excerpt` — long_sentence's only distinguishing content;
 *      since the analyzer re-scans the full cumulative message history,
 *      the same sentence's excerpt stays stable across snapshots as long
 *      as it keeps ranking in the analyzer's top-5 findings
 *   4. the suggestion title, normalized — last-resort fallback if a future
 *      style payload shape carries none of the above
 */
export function fingerprintOf(suggestion: FingerprintableSuggestion): string {
  const payload = suggestion.payload ?? {};

  switch (suggestion.type) {
    case 'overused_word':
      return `overused_word:${normalize(payload['word'])}`;
    case 'grammar':
      return `grammar:${normalize(payload['rule'])}`;
    case 'style':
      return `style:${styleKey(payload, suggestion.title)}`;
  }
}

function styleKey(payload: Record<string, unknown>, title: string): string {
  if (typeof payload['phrase'] === 'string') {
    return normalize(payload['phrase']);
  }
  if (typeof payload['word'] === 'string') {
    return normalize(payload['word']);
  }
  if (typeof payload['excerpt'] === 'string') {
    return normalize(payload['excerpt']);
  }
  return normalize(title);
}

function normalize(value: unknown): string {
  return String(value).trim().toLowerCase();
}
