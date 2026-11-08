import type { InflectionForms } from '../dictionary/types/inflection-forms.types';

export type ParadigmRow = {
  form: string;
  relationType: string;
  partOfSpeech: string;
};

function regularForms(lemma: string, suffix: string): Set<string> {
  const forms = new Set([lemma + suffix]);
  if (lemma.endsWith('e')) forms.add(lemma + suffix.slice(1));
  if (/[^aeiou]y$/.test(lemma)) forms.add(lemma.slice(0, -1) + 'i' + suffix);
  if (/[aeiou][^aeiouwxy]$/.test(lemma))
    forms.add(lemma + lemma.slice(-1) + suffix);
  return forms;
}

export function projectParadigm(
  lemma: string,
  pos: string,
  rows: ParadigmRow[] = [],
): { inflectionForms: InflectionForms | null; hasIrregularForms: boolean } {
  const forms = rows
    .filter(
      (r) =>
        r.partOfSpeech === pos && r.relationType !== 'alternative_spelling',
    )
    .sort((a, b) => a.form.localeCompare(b.form));
  const get = (type: string): string | undefined =>
    forms.find((r) => r.relationType === type)?.form;
  let inflectionForms: InflectionForms | null = null;
  if (pos === 'verb')
    inflectionForms = {
      type: 'verb',
      base: lemma,
      ...(get('past') ? { past: get('past') } : {}),
      ...(get('past_participle')
        ? { pastParticiple: get('past_participle') }
        : {}),
      ...(get('present_3sg') ? { present3sg: get('present_3sg') } : {}),
      ...(get('present_non_3sg')
        ? { presentNon3sg: get('present_non_3sg') }
        : {}),
      ...(get('present_participle')
        ? { gerundParticiple: get('present_participle') }
        : {}),
    };
  if (pos === 'noun')
    inflectionForms = {
      type: 'noun',
      singular: lemma,
      ...(get('plural') ? { plural: get('plural') } : {}),
    };
  if (pos === 'adjective' || pos === 'adverb')
    inflectionForms = {
      type: 'adjective',
      positive: lemma,
      ...(get('comparative') ? { comparative: get('comparative') } : {}),
      ...(get('superlative') ? { superlative: get('superlative') } : {}),
    };
  const hasIrregularForms = forms.some(({ form, relationType }) => {
    if (pos === 'verb' && ['past', 'past_participle'].includes(relationType))
      return !regularForms(lemma, 'ed').has(form);
    if (pos === 'verb' && relationType === 'present_non_3sg')
      return form !== lemma;
    if (pos === 'noun' && relationType === 'plural')
      return !new Set([
        lemma + 's',
        lemma + 'es',
        ...(/[^aeiou]y$/.test(lemma) ? [lemma.slice(0, -1) + 'ies'] : []),
      ]).has(form);
    if (
      ['adjective', 'adverb'].includes(pos) &&
      ['comparative', 'superlative'].includes(relationType)
    )
      return !regularForms(
        lemma,
        relationType === 'comparative' ? 'er' : 'est',
      ).has(form);
    return false;
  });
  return { inflectionForms, hasIrregularForms };
}

/** Keeps variant answers in a frozen card snapshot without changing scalar DTO fields. */
export function snapshotParadigm(
  lemma: string,
  pos: string,
  rows: ParadigmRow[],
): InflectionForms | null {
  const projected = projectParadigm(lemma, pos, rows).inflectionForms;
  if (!projected) return null;
  const keys: Record<string, string> = {
    past: 'past',
    past_participle: 'pastParticiple',
    present_3sg: 'present3sg',
    present_non_3sg: 'presentNon3sg',
    present_participle: 'gerundParticiple',
    plural: 'plural',
    comparative: 'comparative',
    superlative: 'superlative',
  };
  const variants: Record<string, string[]> = {};
  for (const row of rows) {
    const key = keys[row.relationType];
    if (!key || row.partOfSpeech !== pos || !(key in projected)) continue;
    variants[key] = [...new Set([...(variants[key] ?? []), row.form])].sort();
  }
  const multiple = Object.fromEntries(
    Object.entries(variants).filter(([, values]) => values.length > 1),
  );
  return Object.keys(multiple).length
    ? { ...projected, variants: multiple }
    : projected;
}
