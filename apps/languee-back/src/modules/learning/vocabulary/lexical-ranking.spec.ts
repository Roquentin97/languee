import { PartOfSpeech } from '../../lexicon/types/part-of-speech.enum';
import { rankLexicalGroups } from './lexical-ranking';
import type { LookupHeadword } from '../../lexicon/enrichment/dictionary/types/lookup-word.types';

const headword = (lemma: string, pos: PartOfSpeech): LookupHeadword => ({
  wordId: lemma,
  lemma,
  language: 'en',
  relations: [],
  partsOfSpeech: [
    {
      partOfSpeech: pos,
      definitions: [
        {
          id: `${lemma}-definition`,
          partOfSpeech: pos,
          definition: 'definition',
          example: null,
          provider: 'fixture',
          hasIrregularForms: false,
          inflectionForms: null,
        },
      ],
    },
  ],
});
const words = [
  headword('saw', PartOfSpeech.VERB),
  headword('see', PartOfSpeech.VERB),
  headword('saw', PartOfSpeech.NOUN),
];

describe('lexical ranking', () => {
  it('prefers an exact validated pair while retaining alternatives', () => {
    const result = rankLexicalGroups(words, 'see', PartOfSpeech.VERB, true);
    expect(result.preferred?.lemma).toBe('see');
    expect(result.groups.map((g) => `${g.lemma}:${g.partOfSpeech}`)).toEqual([
      'see:verb',
      'saw:verb',
      'saw:noun',
    ]);
  });
  it('does not prefer among multiple same-POS candidates', () => {
    const result = rankLexicalGroups(words, 'unknown', PartOfSpeech.VERB, true);
    expect(result.preferred).toBeNull();
    expect(result.groups.map((g) => g.partOfSpeech)).toEqual([
      'verb',
      'verb',
      'noun',
    ]);
  });
  it('promotes a unique same-POS candidate', () => {
    expect(
      rankLexicalGroups(words, 'unknown', PartOfSpeech.NOUN, true).preferred
        ?.lemma,
    ).toBe('saw');
  });
  it('keeps stable order without a usable contextual POS', () => {
    const result = rankLexicalGroups(words, 'see', null, true);
    expect(result.preferred).toBeNull();
    expect(result.groups.map((g) => `${g.lemma}:${g.partOfSpeech}`)).toEqual([
      'saw:noun',
      'saw:verb',
      'see:verb',
    ]);
  });
});
