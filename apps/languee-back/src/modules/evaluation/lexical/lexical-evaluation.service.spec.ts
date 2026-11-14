import { LexicalKind } from '@prisma/client';
import { PartOfSpeech } from '../../lexicon/types/part-of-speech.enum';
import type { PrismaService } from '../../system/core/prisma/prisma.service';
import { LexicalEvaluationService } from './lexical-evaluation.service';
import { rankLexicalGroups } from '../../learning/vocabulary/lexical-ranking';

describe('lexical evaluation snapshots', () => {
  const create = jest.fn();
  const service = new LexicalEvaluationService({
    evalLexicalLookup: { create },
  } as unknown as PrismaService);
  const base = {
    input: 'oxen',
    language: 'en',
    kind: LexicalKind.word,
    source: 'provider' as const,
    preferred: null,
    headwords: [
      {
        wordId: 'ox',
        lemma: 'ox',
        language: 'en',
        relations: [{ partOfSpeech: 'noun', relationType: 'plural' }],
        partsOfSpeech: [
          {
            partOfSpeech: PartOfSpeech.NOUN,
            definitions: [
              {
                id: 'def',
                partOfSpeech: PartOfSpeech.NOUN,
                definition: 'animal',
                example: null,
                provider: 'fixture',
                hasIrregularForms: false,
                inflectionForms: null,
              },
            ],
          },
        ],
      },
    ],
  };
  const record = async (
    input: Parameters<typeof service.scheduleLookup>[1],
    analysis: Parameters<typeof service.scheduleLookup>[2],
    output: Parameters<typeof service.scheduleLookup>[3],
  ) => {
    service.scheduleLookup(
      'lookup-id',
      input,
      analysis,
      output,
      rankLexicalGroups(
        output.headwords,
        analysis.lemma,
        analysis.pos,
        Boolean(input.context?.trim()) &&
          !input.disablePosFiltering &&
          analysis.pos !== null,
      ),
    );
    await new Promise<void>((resolve) => setImmediate(resolve));
  };
  beforeEach(() => create.mockReset().mockResolvedValue({}));
  it('records a dictionary override and its supporting relationship', async () => {
    await record(
      {
        word: 'oxen',
        language: 'en',
        userId: 'user',
        context: 'Two oxen',
        selectionStart: 4,
        selectionEnd: 8,
      },
      {
        kind: 'word',
        lemma: 'oxen',
        pos: PartOfSpeech.NOUN,
        rawPos: 'NOUN',
        modelVersion: 'model@1',
        isIrregular: false,
        inflectionForms: null,
      },
      base,
    );
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        nlpPos: 'NOUN',
        preferredWordId: 'ox',
        candidates: [
          expect.objectContaining({
            definitionIds: ['def'],
            relationships: [{ partOfSpeech: 'noun', relationType: 'plural' }],
          }),
        ],
        disagreement: {
          create: {
            outcome: 'resolved_override',
            reason: 'unique_pos_candidate',
          },
        },
      }),
    });
  });
  it('records disagreement even when contextual presentation is disabled', async () => {
    await record(
      {
        word: 'oxen',
        language: 'en',
        userId: 'user',
        context: 'Two oxen',
        disablePosFiltering: true,
      },
      {
        kind: 'word',
        lemma: 'oxen',
        pos: PartOfSpeech.NOUN,
        rawPos: 'NOUN',
        modelVersion: 'model@1',
        isIrregular: false,
        inflectionForms: null,
      },
      base,
    );
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        preferredWordId: null,
        preferredPos: null,
        disagreement: {
          create: {
            outcome: 'resolved_override',
            reason: 'unique_pos_candidate',
          },
        },
      }),
    });
  });
  it('records an empty contextual miss for later review', async () => {
    await record(
      { word: 'oxen', language: 'en', userId: 'user', context: 'Two oxen' },
      {
        kind: 'word',
        lemma: 'oxen',
        pos: PartOfSpeech.NOUN,
        rawPos: 'NOUN',
        modelVersion: 'model@1',
        isIrregular: false,
        inflectionForms: null,
      },
      { ...base, headwords: [] },
    );
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        candidates: [],
        preferredWordId: null,
        disagreement: {
          create: { outcome: 'unresolved', reason: 'no_pos_candidate' },
        },
      }),
    });
  });
  it('does not compare a manual lookup', async () => {
    await record(
      { word: 'oxen', language: 'en', userId: 'user' },
      {
        kind: 'word',
        lemma: 'oxen',
        pos: PartOfSpeech.NOUN,
        rawPos: 'NOUN',
        modelVersion: 'model@1',
        isIrregular: false,
        inflectionForms: null,
      },
      base,
    );
    const data = create.mock.calls[0][0].data;
    expect(data.context).toBeNull();
    expect(data.preferredWordId).toBeNull();
    expect(data.disagreement).toBeUndefined();
  });
});

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
