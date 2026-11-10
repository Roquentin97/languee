import { VocabularyService } from './vocabulary.service';
import { DictionaryService } from '../../lexicon/enrichment/dictionary/dictionary.service';
import { CardsService } from '../cards/cards.service';
import { NlpService } from '../../lexicon/enrichment/nlp/nlp.service';
import { WordsService } from '../../lexicon/entries/words/words.service';
import { DefinitionService } from '../../lexicon/entries/definitions/definitions.service';
import { PartOfSpeech } from '../../lexicon/types/part-of-speech.enum';

const def = (id: string, partOfSpeech: PartOfSpeech) => ({
  id,
  partOfSpeech,
  definition: id,
  example: null,
  provider: 'fixture',
  inflectionForms: null,
  hasIrregularForms: false,
});
const result = {
  input: 'better',
  language: 'en',
  kind: 'word' as const,
  source: 'cache' as const,
  preferred: { wordId: 'good', partOfSpeech: null },
  headwords: [
    {
      wordId: 'better',
      lemma: 'better',
      language: 'en',
      relations: [],
      partsOfSpeech: [
        {
          partOfSpeech: PartOfSpeech.VERB,
          definitions: [def('verb', PartOfSpeech.VERB)],
        },
      ],
    },
    {
      wordId: 'good',
      lemma: 'good',
      language: 'en',
      relations: [{ partOfSpeech: 'adjective', relationType: 'comparative' }],
      partsOfSpeech: [
        {
          partOfSpeech: PartOfSpeech.ADJECTIVE,
          definitions: [def('adj', PartOfSpeech.ADJECTIVE)],
        },
        {
          partOfSpeech: PartOfSpeech.NOUN,
          definitions: [def('noun', PartOfSpeech.NOUN)],
        },
      ],
    },
  ],
};

describe('multi-headword vocabulary lookup', () => {
  const lookup = jest.fn().mockResolvedValue(result);
  const cards = jest
    .fn()
    .mockResolvedValue([
      { definitionId: 'verb', deck: { id: 'deck', name: 'Saved' } },
    ]);
  const analyze = jest.fn();
  const service = new VocabularyService(
    { lookup } as unknown as DictionaryService,
    { findCardsByDefinitionIdsAndUserId: cards } as unknown as CardsService,
    { analyze } as unknown as NlpService,
    {} as WordsService,
    {} as DefinitionService,
  );
  it.each([
    {
      context: undefined,
      pos: PartOfSpeech.ADJECTIVE,
      preferred: null,
      unmatched: false,
    },
    {
      context: 'It is better',
      pos: PartOfSpeech.ADJECTIVE,
      preferred: PartOfSpeech.ADJECTIVE,
      unmatched: false,
    },
    {
      context: 'It is better',
      pos: PartOfSpeech.VERB,
      preferred: null,
      unmatched: true,
    },
  ])(
    'preserves alternatives with context $context and POS $pos',
    async ({ context, pos, preferred, unmatched }) => {
      analyze.mockResolvedValue({
        kind: 'word',
        lemma: 'good',
        pos,
        isIrregular: false,
        inflectionForms: null,
      });
      const output = await service.lookup({
        word: 'better',
        language: 'en',
        userId: 'user',
        context,
      });
      expect(output.preferred).toEqual({
        wordId: 'good',
        partOfSpeech: preferred,
      });
      expect(output.meta.unmatchedPos).toBe(unmatched);
      expect(output.headwords).toHaveLength(2);
      expect(output.headwords[1].partsOfSpeech).toHaveLength(2);
      expect(output.headwords[0].partsOfSpeech[0].definitions[0]).toMatchObject(
        { id: 'verb', decks: [{ id: 'deck', name: 'Saved' }] },
      );
      expect(cards).toHaveBeenLastCalledWith(['verb', 'adj', 'noun'], 'user');
      expect(JSON.parse(JSON.stringify(output))).not.toHaveProperty(
        'definitions',
      );
    },
  );
});
