import { VocabularyService } from './vocabulary.service';
import { DictionaryService } from '../../lexicon/enrichment/dictionary/dictionary.service';
import { CardsService } from '../cards/cards.service';
import { NlpService } from '../../lexicon/enrichment/nlp/nlp.service';
import { WordsService } from '../../lexicon/entries/words/words.service';
import { DefinitionService } from '../../lexicon/entries/definitions/definitions.service';
import { PartOfSpeech } from '../../lexicon/types/part-of-speech.enum';
import { DefinitionsNotFoundException } from '../../lexicon/enrichment/dictionary/dictionary.errors';
import type { LexicalEvaluationService } from '../../evaluation/lexical/lexical-evaluation.service';

const def = (id: string, partOfSpeech: PartOfSpeech) => ({
  id,
  partOfSpeech,
  definition: id,
  example: null,
  provider: 'fixture',
  inflectionForms: null,
  hasIrregularForms: false,
});

it.each([undefined, 'missing word'])(
  'schedules an empty miss with context %s',
  async (context) => {
    const error = new DefinitionsNotFoundException('missing', 'en');
    const record = jest.fn();
    const service = new VocabularyService(
      {
        lookup: jest.fn().mockRejectedValue(error),
      } as unknown as DictionaryService,
      {} as CardsService,
      {
        analyze: jest.fn().mockResolvedValue({
          kind: 'word',
          lemma: 'missing',
          pos: PartOfSpeech.NOUN,
        }),
      } as unknown as NlpService,
      {} as WordsService,
      {} as DefinitionService,
      { scheduleLookup: record } as unknown as LexicalEvaluationService,
    );
    await expect(
      service.lookup({
        word: 'missing',
        language: 'en',
        userId: 'user',
        context,
      }),
    ).rejects.toBe(error);
    expect(record).toHaveBeenCalledWith(
      expect.any(String),
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ headwords: [] }),
      expect.anything(),
    );
  },
);
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

it('returns definitions with a correlation ID without waiting for storage', async () => {
  const service = new VocabularyService(
    {
      lookup: jest.fn().mockResolvedValue(result),
    } as unknown as DictionaryService,
    {
      findCardsByDefinitionIdsAndUserId: jest.fn().mockResolvedValue([]),
    } as unknown as CardsService,
    {
      analyze: jest.fn().mockResolvedValue({
        kind: 'word',
        lemma: 'good',
        pos: PartOfSpeech.ADJECTIVE,
      }),
    } as unknown as NlpService,
    {} as WordsService,
    {} as DefinitionService,
    {
      scheduleLookup: jest.fn(),
    } as unknown as LexicalEvaluationService,
  );
  const response = await service.lookup({
    word: 'better',
    language: 'en',
    userId: 'user',
    context: 'It is better',
  });
  expect(response.lookupId).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
  expect(response.orderedGroups).toHaveLength(3);
  expect(response.preferred).toEqual({
    wordId: 'good',
    partOfSpeech: PartOfSpeech.ADJECTIVE,
  });
});

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
      preferred: PartOfSpeech.VERB,
      unmatched: false,
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
      const expectedPreferred = preferred
        ? {
            wordId: pos === PartOfSpeech.VERB ? 'better' : 'good',
            partOfSpeech: preferred,
          }
        : null;
      expect(output.preferred).toEqual(expectedPreferred);
      expect(output.meta.unmatchedPos).toBe(unmatched);
      expect(output.headwords).toHaveLength(2);
      expect(output.headwords[1].partsOfSpeech).toHaveLength(2);
      expect(output.headwords[0].partsOfSpeech[0].definitions[0]).toMatchObject(
        { id: 'verb', decks: [{ id: 'deck', name: 'Saved' }] },
      );
      expect(cards).toHaveBeenLastCalledWith(['verb', 'adj', 'noun'], 'user');
      expect(JSON.parse(JSON.stringify(output))).toMatchObject({
        input: 'better',
        preferred: expectedPreferred,
        headwords: [
          {
            wordId: 'better',
            partsOfSpeech: [
              {
                partOfSpeech: 'verb',
                definitions: [
                  { id: 'verb', decks: [{ id: 'deck', name: 'Saved' }] },
                ],
              },
            ],
          },
          {
            wordId: 'good',
            partsOfSpeech: [
              { partOfSpeech: 'adjective', definitions: [{ id: 'adj' }] },
              { partOfSpeech: 'noun', definitions: [{ id: 'noun' }] },
            ],
          },
        ],
      });
    },
  );
});
