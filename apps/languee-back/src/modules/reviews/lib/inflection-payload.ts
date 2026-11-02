/**
 * Pure helpers for the inflection card's "type all forms, then reveal" flow.
 * The queue only ever exposes which form *keys* exist (never the answers);
 * `checkTypedForms` compares a learner's submission against the stored
 * paradigm purely for feedback - it never affects scheduling, which is
 * always the learner's self-assessed rating.
 */
import type { InflectionForms } from '../../dictionary/types/inflection-forms.types';
import { normalizeAnswer } from './answer-matching';

export type FormCheckResult = {
  typed: string;
  expected: string;
  correct: boolean;
};

/**
 * The set of populated form keys for a paradigm, in declaration order,
 * excluding the `type` discriminator and any unset (undefined) forms.
 */
export function formKeysFor(inflectionForms: InflectionForms): string[] {
  return Object.entries(inflectionForms)
    .filter(
      ([key, value]) =>
        key !== 'type' && typeof value === 'string' && value.length > 0,
    )
    .map(([key]) => key);
}

/**
 * Per-key correctness of a learner's typed forms against the stored
 * paradigm. Missing keys in `typedForms` are treated as an empty (incorrect)
 * answer for that form.
 */
export function checkTypedForms(
  inflectionForms: InflectionForms,
  typedForms: Record<string, string>,
): Record<string, FormCheckResult> {
  const forms = inflectionForms as unknown as Record<string, string>;
  const results: Record<string, FormCheckResult> = {};

  for (const key of formKeysFor(inflectionForms)) {
    const expected = forms[key] ?? '';
    const typed = typedForms[key] ?? '';
    results[key] = {
      typed,
      expected,
      correct: normalizeAnswer(typed) === normalizeAnswer(expected),
    };
  }

  return results;
}
