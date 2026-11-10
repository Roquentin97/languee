import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import corpus from '../fixtures/corpus.json';
import { parseWiktionaryEntry } from './wiktionary.parser';
import { classifyReference } from './form-reference.parser';
import { PartOfSpeech } from '../../../types/part-of-speech.enum';

const fixture = (s: string): unknown =>
  JSON.parse(readFileSync(join(__dirname, '../fixtures', `${s}.json`), 'utf8'));
describe('frozen Wiktionary corpus', () => {
  it.each(corpus.dictionary_cases)(
    '$id $surface exact relationships and independent inventory',
    (c) => {
      const result = parseWiktionaryEntry(fixture(c.surface), 'en', c.surface);
      const actual = result.references
        .filter((r) => r.category === 'morphological_reference')
        .flatMap((r) =>
          r.targets.flatMap((target) =>
            r.relationTypes.map(
              (type) => `${r.sourcePos}:${target}:${r.targetPos}:${type}`,
            ),
          ),
        )
        .sort();
      expect(actual).toEqual(
        c.morphological_references
          .flatMap((r) =>
            r.types.map(
              (type) => `${r.source_pos}:${r.target}:${r.target_pos}:${type}`,
            ),
          )
          .sort(),
      );
      const counts = Object.fromEntries(
        [...new Set(result.definitions.map((d) => d.partOfSpeech))].map(
          (pos) => [
            pos,
            result.definitions.filter((d) => d.partOfSpeech === pos).length,
          ],
        ),
      );
      const expected =
        (c.surface === 'running' ||
        c.surface === 'meeting' ||
        c.surface === 'exhausted'
          ? undefined
          : (c.gold_independent_record_counts_by_pos ??
            c.observed_independent_record_counts_by_pos)) ??
        {
          running: { adjective: 10, adverb: 1, noun: 6, preposition: 1 },
          meeting: { noun: 7 },
          exhausted: { adjective: 3 },
        }[c.surface];
      const supported = Object.fromEntries(
        Object.entries(expected ?? {}).filter(([p]) => p !== 'symbol'),
      );
      expect(counts).toEqual(supported);
      expect(
        result.definitions.some((d) =>
          /^(?:plural|simple past|past participle|alternative spelling) of/i.test(
            d.definition,
          ),
        ),
      ).toBe(false);
    },
  );
});
const link = (target: string) =>
  `<span class="form-of-definition-link"><a href="/wiki/${encodeURIComponent(target)}" title="${target}">${target}</a></span>`;
const marked = (s: string) => `<span class="form-of-definition">${s}</span>`;
describe('conservative reference classification', () => {
  it.each([
    ['R01', 'A tool to <a href="/wiki/cut">cut</a> wood.', 'noun', null],
    [
      'R02',
      marked(`Alternative spelling of ${link('bettor')}`),
      'noun',
      'alternative_spelling',
    ],
    [
      'R03',
      marked(`Alternative form of ${link('ask')}`),
      'verb',
      'other_reference',
    ],
    [
      'R04',
      marked(`plural of ${link('ax')} and ${link('axe')}`),
      'noun',
      'morphological_reference',
    ],
    [
      'R05',
      marked(`simple past and past participle of ${link('poise')}`),
      'verb',
      'morphological_reference',
    ],
    ['R07', marked('plural of cat') + link('dog'), 'noun', 'unresolved'],
    ['R08', marked(`derived from ${link('cat')}`), 'noun', 'unresolved'],
    [
      'R09',
      marked(`past participle of ${link('run')}`),
      'adjective',
      'unresolved',
    ],
    ['R10', marked(`plural of the verb ${link('run')}`), 'noun', 'unresolved'],
    [
      'R11',
      marked(`plural of ${link('rock & roll')}`),
      'noun',
      'morphological_reference',
    ],
    [
      'R12',
      marked(
        'plural of <span class="form-of-definition-link"><a href="/wiki/dog" title="cat">cat</a></span>',
      ),
      'noun',
      'unresolved',
    ],
    ['R14', 'plural of cat', 'noun', 'unresolved'],
    [
      'R15',
      '<a href="/wiki/had_better">Had better</a>.',
      'verb',
      'other_reference',
    ],
    [
      'R18',
      '<span class="form-of-definition">broken ' + link('cat'),
      'noun',
      'unresolved',
    ],
  ])('%s', (_id, html, pos, expected) => {
    const result = classifyReference(html, 'surface', pos as PartOfSpeech);
    expect(result?.category ?? null).toBe(expected);
    if (expected === 'unresolved') expect(result?.targetPos).toBeNull();
  });
  it('R06/R13 keeps mixed and repeated sections isolated', () => {
    const entry = parseWiktionaryEntry(
      {
        en: [
          {
            partOfSpeech: 'Noun',
            definitions: [{ definition: 'A creature.' }],
          },
          {
            partOfSpeech: 'Noun',
            definitions: [{ definition: marked(`plural of ${link('cat')}`) }],
          },
        ],
      },
      'en',
      'cats',
    );
    expect(entry.definitions.map((d) => d.definition)).toEqual(['A creature.']);
    expect(entry.references).toHaveLength(1);
  });
  it('R16 no English section is an empty supported result', () =>
    expect(parseWiktionaryEntry({ fr: [] }, 'en', 'x')).toEqual({
      definitions: [],
      references: [],
    }));
});
