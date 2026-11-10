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
        { wordId: '1', lemma: 'poise', definitions: [definition] },
        {
          wordId: '2',
          lemma: 'poised',
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
    expect(result.lemma).toBe('poise');
    expect(result.definitions).toEqual([definition]);
    expect(discover).toHaveBeenCalledWith('poised', 'en', 'poise', 'word');
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
