import { DictionaryService } from './dictionary.service';
import { HeadwordDiscoveryService } from './headword-discovery.service';
import { DefinitionsNotFoundException } from './dictionary.errors';
import { PartOfSpeech } from '../../types/part-of-speech.enum';

const definition = {
  id: 'd',
  partOfSpeech: PartOfSpeech.NOUN,
  definition: 'balance',
  example: null,
  provider: 'fixture',
  inflectionForms: null,
  hasIrregularForms: false,
};
describe('DictionaryService public projection', () => {
  const discover = jest.fn();
  const service = new DictionaryService({
    discover,
  } as unknown as HeadwordDiscoveryService);
  it('selects one owning headword without flattening other headwords into it', async () => {
    discover.mockResolvedValue({
      source: 'provider',
      headwords: [
        {
          wordId: '1',
          lemma: 'poise',
          relations: [],
          definitions: [definition],
        },
        {
          wordId: '2',
          lemma: 'poised',
          relations: [],
          definitions: [
            { ...definition, id: 'adj', partOfSpeech: PartOfSpeech.ADJECTIVE },
          ],
        },
      ],
    });
    const result = await service.lookup({
      word: 'poised',
      lemma: 'poise',
      kind: 'word',
      language: 'en',
    });
    expect(result.preferred).toEqual({ wordId: '1', partOfSpeech: null });
    expect(result.headwords.map((w) => w.lemma)).toEqual(['poise', 'poised']);
    expect(result.headwords[0].partsOfSpeech[0].definitions).toEqual([
      definition,
    ]);
    expect(discover).toHaveBeenCalledWith('poised', 'en', 'poise', 'word');
  });
  it('preserves headword identities, POS groups, and surface relationships', async () => {
    const adj = {
      ...definition,
      id: 'adj',
      partOfSpeech: PartOfSpeech.ADJECTIVE,
    };
    const adverb = {
      ...definition,
      id: 'adv',
      partOfSpeech: PartOfSpeech.ADVERB,
    };
    discover.mockResolvedValue({
      source: 'cache',
      headwords: [
        {
          wordId: 'better-id',
          lemma: 'better',
          relations: [],
          definitions: [definition],
        },
        {
          wordId: 'good-id',
          lemma: 'good',
          relations: [
            {
              partOfSpeech: PartOfSpeech.ADJECTIVE,
              relationType: 'comparative',
            },
          ],
          definitions: [adj, adverb],
        },
      ],
    });
    const result = await service.lookup({
      word: 'better',
      lemma: 'good',
      language: 'en',
      kind: 'word',
    });
    expect(result.preferred).toEqual({ wordId: 'good-id', partOfSpeech: null });
    expect(result.headwords).toHaveLength(2);
    expect(result.headwords[1]).toMatchObject({
      wordId: 'good-id',
      language: 'en',
      relations: [{ partOfSpeech: 'adjective', relationType: 'comparative' }],
      partsOfSpeech: [
        { partOfSpeech: 'adjective', definitions: [adj] },
        { partOfSpeech: 'adverb', definitions: [adverb] },
      ],
    });
    expect(result).not.toHaveProperty('definitions');
  });
  it('reports an empty completed result as a dictionary miss', async () => {
    discover.mockResolvedValue({ source: 'cache', headwords: [] });
    await expect(
      service.lookup({ word: 'qzvx', kind: 'word', language: 'en' }),
    ).rejects.toBeInstanceOf(DefinitionsNotFoundException);
  });
  it('propagates failures', async () => {
    discover.mockRejectedValue(new Error('outage'));
    await expect(
      service.lookup({ word: 'qzvx', kind: 'word', language: 'en' }),
    ).rejects.toThrow('outage');
  });
});
