import type { InflectionForms } from '../../dictionary/types/inflection-forms.types';

/**
 * Whether a word's persisted NLP paradigm has more than one distinct form -
 * i.e. whether it is worth generating an inflection card for. This is
 * distinct from "irregular": a regular verb like "walk" still inflects
 * (walk/walked/walks/walking) even though it forms those forms predictably.
 *
 * Expressions only ever carry a single context-derived form, never a full
 * paradigm, so they never inflect under this definition.
 */
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
