import type { InflectionForms } from '../../../lexicon/types/inflection-forms.types';

/** Whether a paradigm contains grammatical forms worth reviewing. */
export function wordInflects(
  inflectionForms: InflectionForms | null | undefined,
): boolean {
  if (!inflectionForms) return false;

  switch (inflectionForms.type) {
    case 'verb':
      return Boolean(
        inflectionForms.past ||
        inflectionForms.present3sg ||
        inflectionForms.presentNon3sg ||
        inflectionForms.pastParticiple ||
        inflectionForms.gerundParticiple,
      );
    case 'noun':
      return Boolean(inflectionForms.plural);
    case 'adjective':
      return Boolean(
        inflectionForms.comparative || inflectionForms.superlative,
      );
    case 'expression':
      return false;
  }
}
