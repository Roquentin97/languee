/**
 * Pure helpers for normalizing and checking a typed review answer against
 * the accepted target forms for a card.
 */

export type AnswerCheckResult =
  | { result: 'correct'; matchedForm: string }
  | { result: 'incorrect'; matchedForm: null };

/**
 * Normalizes an answer for comparison: NFC-normalize, trim, lowercase, and
 * collapse internal whitespace runs to a single space.
 */
export function normalizeAnswer(value: string): string {
  return value.normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Checks a typed answer against the card's target forms. `matchedForm` is the
 * accepted form as originally stored, not the normalized value.
 */
export function checkAnswer(
  typedAnswer: string,
  targetForms: string[],
): AnswerCheckResult {
  const normalizedTyped = normalizeAnswer(typedAnswer);

  for (const form of targetForms) {
    if (normalizeAnswer(form) === normalizedTyped) {
      return { result: 'correct', matchedForm: form };
    }
  }

  return { result: 'incorrect', matchedForm: null };
}
