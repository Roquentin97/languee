import { LexicalKind } from '@prisma/client';
import { PartOfSpeech } from '../../lexicon/types/part-of-speech.enum';
import type { PrismaService } from '../../system/core/prisma/prisma.service';
import { LexicalEvaluationService } from './lexical-evaluation.service';

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
  beforeEach(() => create.mockReset().mockResolvedValue({}));
  it('records a dictionary override and its supporting relationship', async () => {
    await service.record(
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
    await service.record(
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
    await service.record(
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
    await service.record(
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
