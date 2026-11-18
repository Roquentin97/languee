import { LexicalEntryKind } from '@prisma/client';
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
    kind: LexicalEntryKind.word,
    source: 'provider' as const,
    preferred: null,
    headwords: [
      {
        entryId: 'ox',
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
        text: 'oxen',
        language: 'en',
        userId: 'user',
        context: 'Two oxen',
        selectionRanges: [{ start: 4, end: 8 }],
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
        preferredEntryId: 'ox',
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
        text: 'oxen',
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
        preferredEntryId: null,
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
      { text: 'oxen', language: 'en', userId: 'user', context: 'Two oxen' },
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
        preferredEntryId: null,
        disagreement: {
          create: { outcome: 'unresolved', reason: 'no_pos_candidate' },
        },
      }),
    });
  });
  it('does not compare a manual lookup', async () => {
    await record(
      { text: 'oxen', language: 'en', userId: 'user' },
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
    expect(data.preferredEntryId).toBeNull();
    expect(data.disagreement).toBeUndefined();
  });

  it('records expression identity and all selected component ranges', async () => {
    const selectionRanges = [
      { start: 10, end: 14 },
      { start: 15, end: 18 },
    ];
    service.scheduleExpressionLookup(
      'expression-lookup-id',
      {
        text: 'turn off',
        language: 'en',
        userId: 'user',
        context: 'We should turn off the lights.',
        selectionRanges,
      },
      {
        kind: 'phrasal_verb',
        canonical: 'turn off',
        headLemma: 'turn',
        modelVersion: 'en_core_web_md@3.8.0',
        contextMatch: {
          found: true,
          matchedText: 'turn off',
          confidence: 'high',
        },
        selectionAnalysis: {
          headLemma: 'turn',
          pos: 'VERB',
          headRange: { start: 10, end: 14 },
        },
      },
      {
        input: 'turn off',
        language: 'en',
        kind: LexicalEntryKind.phrasal_verb,
        source: 'cache',
        preferred: { entryId: 'expression-id', partOfSpeech: null },
        headwords: [
          {
            entryId: 'expression-id',
            lemma: 'turn off',
            language: 'en',
            relations: [],
            partsOfSpeech: [
              {
                partOfSpeech: PartOfSpeech.VERB,
                definitions: [
                  {
                    id: 'expression-definition-id',
                    partOfSpeech: PartOfSpeech.VERB,
                    definition: 'to stop a device',
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
      },
    );
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: 'expression-lookup-id',
        userId: 'user',
        surface: 'turn off',
        selectionRanges,
        nlpLemma: 'turn off',
        nlpPos: 'VERB',
        nlpModelVersion: 'en_core_web_md@3.8.0',
        preferredEntryId: 'expression-id',
        preferredPos: null,
        candidates: [
          expect.objectContaining({
            entryId: 'expression-id',
            lemma: 'turn off',
            definitionIds: ['expression-definition-id'],
          }),
        ],
      }),
    });
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
    text: 'saw',
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
    entryId: 'saw',
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
      preferredEntryId: 'see',
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
          chosenEntryId: 'saw',
          lookupId: 'id',
        }),
        update: {},
      }),
    );
  });

  it('does not record a choice that agrees with a preferred pair', async () => {
    findFirst.mockResolvedValue({
      preferredEntryId: 'saw',
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
      preferredEntryId: null,
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
