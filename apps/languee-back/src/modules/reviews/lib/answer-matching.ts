/**
 * Pure helpers for normalizing and checking a typed review answer against
 * the accepted target forms and known synonym lemmas for a card.
 */

export type AnswerCheckResult =
  | { result: 'correct'; matchedForm: string }
  | { result: 'close_synonym'; matchedForm: null }
  | { result: 'incorrect'; matchedForm: null };

/**
 * Normalizes an answer for comparison: NFC-normalize, trim, lowercase, and
 * collapse internal whitespace runs to a single space.
 */
export function normalizeAnswer(value: string): string {
  return value.normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Checks a typed answer against the card's target forms first (correct),
 * then against known synonym lemmas (close_synonym), falling back to
 * incorrect. `matchedForm` is the accepted form as originally stored, not
 * the normalized value.
 */
export function checkAnswer(
  typedAnswer: string,
  targetForms: string[],
  synonymLemmas: string[],
): AnswerCheckResult {
  const normalizedTyped = normalizeAnswer(typedAnswer);

  for (const form of targetForms) {
    if (normalizeAnswer(form) === normalizedTyped) {
      return { result: 'correct', matchedForm: form };
    }
  }

  for (const lemma of synonymLemmas) {
    if (normalizeAnswer(lemma) === normalizedTyped) {
      return { result: 'close_synonym', matchedForm: null };
    }
  }

  return { result: 'incorrect', matchedForm: null };
}
