import { PartOfSpeech } from '../../lexicon/types/part-of-speech.enum';
import type { PrismaService } from '../../system/core/prisma/prisma.service';
import { LexicalEvaluationService } from './lexical-evaluation.service';

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('best-effort lexical evaluation', () => {
  const create = jest.fn();
  const findFirst = jest.fn();
  const upsert = jest.fn();
  const service = new LexicalEvaluationService({
    evalLexicalLookup: { create, findFirst },
    evalLexicalLearnerChoice: { upsert },
  } as unknown as PrismaService);
  const input = {
    word: 'saw',
    language: 'en',
    userId: 'user',
    context: 'I saw',
  };
  const analysis = {
    kind: 'word' as const,
    lemma: 'see',
    pos: PartOfSpeech.VERB,
    rawPos: 'VERB',
    modelVersion: 'fixture@1',
    isIrregular: false,
    inflectionForms: null,
  };
  const base = {
    input: 'saw',
    language: 'en',
    kind: 'word' as const,
    source: 'cache' as const,
    preferred: null,
    headwords: [],
  };
  const choice = {
    lookupId: 'id',
    userId: 'user',
    definitionId: 'definition',
    wordId: 'saw',
    lemma: 'saw',
    pos: 'verb',
  };

  beforeEach(() => {
    jest.resetAllMocks();
    upsert.mockResolvedValue({});
  });

  it('does not wait for lookup persistence and orders a subsequent choice after it', async () => {
    let finish!: () => void;
    create.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    findFirst.mockResolvedValue({
      preferredWordId: 'see',
      preferredPos: 'verb',
      disagreement: null,
      candidates: [{ definitionIds: ['definition'] }],
    });
    service.scheduleLookup('id', input, analysis, base, {
      groups: [],
      preferred: null,
    });
    service.scheduleChoice(choice);
    expect(create).not.toHaveBeenCalled();
    await tick();
    expect(create).toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
    finish();
    await tick();
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          chosenWordId: 'saw',
          lookupId: 'id',
        }),
        update: {},
      }),
    );
  });

  it('does not record a choice that agrees with a preferred pair', async () => {
    findFirst.mockResolvedValue({
      preferredWordId: 'saw',
      preferredPos: 'verb',
      disagreement: null,
      candidates: [{ definitionIds: ['definition'] }],
    });
    service.scheduleChoice(choice);
    await tick();
    expect(upsert).not.toHaveBeenCalled();
  });

  it('records a choice for a dictionary disagreement even without a preference', async () => {
    findFirst.mockResolvedValue({
      preferredWordId: null,
      preferredPos: null,
      disagreement: { reason: 'multiple_pos_candidates' },
      candidates: [{ definitionIds: ['definition'] }],
    });
    service.scheduleChoice(choice);
    await tick();
    expect(upsert).toHaveBeenCalled();
  });

  it('handles snapshot persistence failures in the background', async () => {
    create.mockRejectedValue(new Error('unavailable'));
    service.scheduleLookup('failure', input, analysis, base, {
      groups: [],
      preferred: null,
    });
    await tick();
    expect(create).toHaveBeenCalled();
  });
});
