/**
 * Pure helpers for deriving the set of target word forms for a card and for
 * masking those forms out of prompt text (definition example, card context).
 */

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Collects the distinct set of textual forms that count as "the target word"
 * for masking and answer-matching purposes: the word's lemma plus every
 * string value on the inflection-forms object, excluding the `type`
 * discriminator key (which holds a part-of-speech label, not a word form).
 */
export function collectTargetForms(
  lemma: string,
  inflectionForms: Record<string, unknown> | null | undefined,
): string[] {
  const forms: string[] = [];
  const seen = new Set<string>();

  const add = (value: string): void => {
    if (value.length === 0) return;
    const key = value.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    forms.push(value);
  };

  add(lemma);

  if (inflectionForms) {
    for (const [key, value] of Object.entries(inflectionForms)) {
      if (key === 'type') continue;
      if (typeof value === 'string') add(value);
    }
  }

  return forms;
}

/**
 * Replaces every standalone occurrence of any target form in `text` with
 * `____`. Matching is case-insensitive and boundary-aware using the Unicode
 * letter class `\p{L}` (forms may not abut other letters, including
 * accented/non-ASCII letters such as ñ, á, ü), and forms are tried
 * longest-first so multi-word expressions are masked before any shorter form
 * they contain. Returns the text unchanged when no form matches, and returns
 * null through for a null input.
 */
export function maskText(
  text: string | null | undefined,
  forms: string[],
): string | null {
  if (text === null || text === undefined) return null;
  if (forms.length === 0) return text;

  const sortedForms = [...forms].sort((a, b) => b.length - a.length);

  let result = text;
  for (const form of sortedForms) {
    if (form.length === 0) continue;
    const pattern = new RegExp(
      `(?<!\\p{L})${escapeRegExp(form)}(?!\\p{L})`,
      'giu',
    );
    result = result.replace(pattern, '____');
  }

  return result;
}
