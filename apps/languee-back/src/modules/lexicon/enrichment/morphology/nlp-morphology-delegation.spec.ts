import { NlpService } from '../nlp/nlp.service';
import { PartOfSpeech } from '../../types/part-of-speech.enum';
import { NlpMorphologyAdapter } from './nlp-morphology.adapter';

it('delegates all morphology operations to NlpService', async () => {
  const nlp = {
    findLemmaCandidates: jest.fn().mockResolvedValue([]),
    getInflections: jest.fn().mockResolvedValue([]),
    getInflectionsBatch: jest.fn().mockResolvedValue([]),
  };
  const adapter = new NlpMorphologyAdapter(nlp as unknown as NlpService);
  await adapter.findLemmaCandidates('went', 'en');
  await adapter.getInflections('go', PartOfSpeech.VERB, 'en');
  await adapter.getInflectionsBatch([], 'en');
  expect(nlp.findLemmaCandidates).toHaveBeenCalledWith('went', 'en');
  expect(nlp.getInflections).toHaveBeenCalledWith(
    'go',
    PartOfSpeech.VERB,
    'en',
  );
  expect(nlp.getInflectionsBatch).toHaveBeenCalledWith([], 'en');
});
