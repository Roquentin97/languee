import { Test, TestingModule } from '@nestjs/testing';
import type { Card, Definition, Deck, Word } from '@prisma/client';
import { MS_PER_MINUTE } from '../core/time/time.constants';
import { PrismaService } from '../core/prisma/prisma.service';
import { CardsService } from '../cards/cards.service';
import type { CardWithRelations } from '../cards/cards.service';
import { CardNotFoundError } from '../cards/cards.errors';
import { DecksService } from '../decks/decks.service';
import { DeckNotFoundError } from '../decks/decks.errors';
import { UnsupportedCardTypeError } from './reviews.errors';
import { ReviewsService } from './reviews.service';

const NOW = new Date('2026-07-02T12:00:00.000Z');

const mockDeck: Deck = {
  id: 'deck-id-1',
  userId: 'user-id-1',
  name: 'English basics',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

const mockWord: Word = {
  id: 'word-id-1',
  lemma: 'run into',
  language: 'en',
  ipa: null,
  kind: 'phrasal_verb',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
};

const mockDefinition: Definition = {
  id: 'def-id-1',
  wordId: 'word-id-1',
  partOfSpeech: 'verb',
  definition: 'To encounter unexpectedly.',
  example: 'I ran into an old friend yesterday.',
  provider: 'free-dictionary',
  gapFillMetadata: null,
  hasIrregularForms: false,
  inflectionForms: { type: 'verb', base: 'run into', past: 'ran into' },
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
};

function baseCard(overrides: Partial<Card>): Card {
  return {
    id: 'card-id-1',
    type: 'existing',
    userId: 'user-id-1',
    definitionId: 'def-id-1',
    wordId: null,
    partOfSpeech: null,
    context: null,
    inflectionForms: null,
    state: 'review',
    dueAt: new Date('2026-07-01T00:00:00.000Z'),
    stability: 10,
    difficulty: 5,
    scheduledDays: 10,
    learningSteps: 0,
    reps: 3,
    lapses: 0,
    lastReviewedAt: new Date('2026-06-20T00:00:00.000Z'),
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-06-20T00:00:00.000Z'),
    ...overrides,
  };
}

const mockExistingCard: CardWithRelations = {
  ...baseCard({
    context: 'Guess who I ran into at the station!',
  }),
  definition: { ...mockDefinition, word: mockWord },
  word: null,
  decks: [{ id: 'deck-id-1', name: 'English basics' }],
};

const mockInflectionCard: CardWithRelations = {
  ...baseCard({
    id: 'card-id-2',
    type: 'inflection',
    definitionId: null,
    wordId: 'word-id-1',
    partOfSpeech: 'verb',
    inflectionForms: {
      type: 'verb',
      base: 'run',
      past: 'ran',
      present3sg: 'runs',
    },
  }),
  definition: null,
  word: mockWord,
  decks: [{ id: 'deck-id-1', name: 'English basics' }],
};

const mockDefinitionCard: CardWithRelations = {
  ...baseCard({
    id: 'card-id-3',
    type: 'definition',
  }),
  definition: { ...mockDefinition, word: mockWord },
  word: null,
  decks: [{ id: 'deck-id-1', name: 'English basics' }],
};

const mockPrismaService = {
  reviewLog: {
    create: jest.fn(),
  },
  $transaction: jest.fn(async (ops: unknown[]): Promise<unknown[]> =>
    Promise.all(ops),
  ),
};

const mockCardsService = {
  findOwnedOrThrow: jest.fn(),
  findDueCards: jest.fn(),
  findUnreviewedCards: jest.fn(),
  countDue: jest.fn(),
  countNew: jest.fn(),
  findExistingCardContexts: jest.fn(),
  findSavedSensesByWordId: jest.fn(),
  buildGradeUpdate: jest.fn(),
};

const mockDecksService = {
  findOneOrThrow: jest.fn(),
};

describe('ReviewsService', () => {
  let service: ReviewsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(NOW);
    mockCardsService.findExistingCardContexts.mockResolvedValue(new Map());
    mockCardsService.findSavedSensesByWordId.mockResolvedValue(new Map());

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReviewsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: CardsService, useValue: mockCardsService },
        { provide: DecksService, useValue: mockDecksService },
      ],
    }).compile();

    service = module.get<ReviewsService>(ReviewsService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getSummary()', () => {
    it('happy path — returns due and new counts', async () => {
      mockCardsService.countDue.mockResolvedValue(5);
      mockCardsService.countNew.mockResolvedValue(3);

      const result = await service.getSummary('user-id-1');

      expect(result).toEqual({ dueCount: 5, newCount: 3 });
      expect(mockCardsService.countDue).toHaveBeenCalledWith('user-id-1', NOW);
      expect(mockCardsService.countNew).toHaveBeenCalledWith('user-id-1');
    });

    it('edge case — zero due and zero new', async () => {
      mockCardsService.countDue.mockResolvedValue(0);
      mockCardsService.countNew.mockResolvedValue(0);

      const result = await service.getSummary('user-id-1');

      expect(result).toEqual({ dueCount: 0, newCount: 0 });
    });
  });

  describe('getQueue()', () => {
    it('happy path — due items ordered before new items, truncated to limit', async () => {
      mockCardsService.findDueCards.mockResolvedValue([mockExistingCard]);
      mockCardsService.findUnreviewedCards.mockResolvedValue([
        mockInflectionCard,
      ]);

      const result = await service.getQueue('user-id-1', { limit: 20 });

      expect(result).toHaveLength(2);
      expect(result[0]?.isNew).toBe(false);
      expect(result[1]?.isNew).toBe(true);
      expect(mockCardsService.findDueCards).toHaveBeenCalledWith(
        'user-id-1',
        undefined,
        NOW,
        20,
      );
      expect(mockCardsService.findUnreviewedCards).toHaveBeenCalledWith(
        'user-id-1',
        undefined,
        19,
      );
    });

    it('limit truncation — does not query new cards when due items already fill the limit', async () => {
      mockCardsService.findDueCards.mockResolvedValue([mockExistingCard]);

      const result = await service.getQueue('user-id-1', { limit: 1 });

      expect(result).toHaveLength(1);
      expect(mockCardsService.findUnreviewedCards).not.toHaveBeenCalled();
    });

    it('deck filter — validates ownership and forwards deckId to both queries', async () => {
      mockDecksService.findOneOrThrow.mockResolvedValue(mockDeck);
      mockCardsService.findDueCards.mockResolvedValue([]);
      mockCardsService.findUnreviewedCards.mockResolvedValue([]);

      await service.getQueue('user-id-1', { deckId: 'deck-id-1', limit: 20 });

      expect(mockDecksService.findOneOrThrow).toHaveBeenCalledWith(
        'deck-id-1',
        'user-id-1',
      );
      expect(mockCardsService.findDueCards).toHaveBeenCalledWith(
        'user-id-1',
        'deck-id-1',
        NOW,
        20,
      );
    });

    it('edge case — deck not owned by user throws DeckNotFoundError, no card queries run', async () => {
      mockDecksService.findOneOrThrow.mockRejectedValue(
        new DeckNotFoundError(),
      );

      await expect(
        service.getQueue('user-id-1', { deckId: 'deck-id-other', limit: 20 }),
      ).rejects.toBeInstanceOf(DeckNotFoundError);

      expect(mockCardsService.findDueCards).not.toHaveBeenCalled();
    });

    it('existing card payload — masks the captured context, derives kind/partOfSpeech/lemmaLength', async () => {
      mockCardsService.findDueCards.mockResolvedValue([mockExistingCard]);
      mockCardsService.findUnreviewedCards.mockResolvedValue([]);

      const result = await service.getQueue('user-id-1', { limit: 20 });

      expect(result[0]).toMatchObject({
        cardId: 'card-id-1',
        type: 'existing',
        decks: [{ id: 'deck-id-1', name: 'English basics' }],
        isNew: false,
        existing: {
          definition: 'To encounter unexpectedly.',
          maskedSentence: 'Guess who I ____ at the station!',
          partOfSpeech: 'verb',
          kind: 'phrasal_verb',
          lemmaLength: 'run into'.length,
          language: 'en',
        },
        inflection: null,
        definition: null,
      });
    });

    it('inflection card payload — exposes form keys but never the values', async () => {
      mockCardsService.findDueCards.mockResolvedValue([]);
      mockCardsService.findUnreviewedCards.mockResolvedValue([
        mockInflectionCard,
      ]);

      const result = await service.getQueue('user-id-1', { limit: 20 });

      expect(result[0]?.inflection).toEqual({
        lemma: 'run into',
        partOfSpeech: 'verb',
        kind: 'phrasal_verb',
        language: 'en',
        formKeys: ['base', 'past', 'present3sg'],
      });
      expect(JSON.stringify(result[0]?.inflection)).not.toContain('"ran"');
    });

    it('definition card payload — hint1 lists other saved senses when >=2 senses exist', async () => {
      mockCardsService.findDueCards.mockResolvedValue([mockDefinitionCard]);
      mockCardsService.findUnreviewedCards.mockResolvedValue([]);
      mockCardsService.findSavedSensesByWordId.mockResolvedValue(
        new Map([
          [
            'word-id-1',
            [
              {
                definitionId: 'def-id-1',
                definition: mockDefinition.definition,
              },
              {
                definitionId: 'def-id-9',
                definition:
                  'a long dictionary sense that will be truncated for the gloss hint because it runs past sixty characters',
              },
            ],
          ],
        ]),
      );
      mockCardsService.findExistingCardContexts.mockResolvedValue(
        new Map([['def-id-1', 'Guess who I ran into at the station!']]),
      );

      const result = await service.getQueue('user-id-1', { limit: 20 });

      expect(result[0]?.definition?.hint1).toEqual([
        expect.stringContaining('a long dictionary sense'),
      ]);
      expect(result[0]?.definition?.hint1?.[0]?.length).toBeLessThanOrEqual(61);
      expect(result[0]?.definition?.hint2).toBe(
        'Guess who I ran into at the station!',
      );
    });

    it('definition card payload — hint1 is null with fewer than 2 saved senses, hint2 falls back to the dictionary example', async () => {
      mockCardsService.findDueCards.mockResolvedValue([mockDefinitionCard]);
      mockCardsService.findUnreviewedCards.mockResolvedValue([]);
      mockCardsService.findSavedSensesByWordId.mockResolvedValue(
        new Map([
          [
            'word-id-1',
            [
              {
                definitionId: 'def-id-1',
                definition: mockDefinition.definition,
              },
            ],
          ],
        ]),
      );
      mockCardsService.findExistingCardContexts.mockResolvedValue(new Map());

      const result = await service.getQueue('user-id-1', { limit: 20 });

      expect(result[0]?.definition?.hint1).toBeNull();
      expect(result[0]?.definition?.hint2).toBe(mockDefinition.example);
    });
  });

  describe('checkTypedAnswer()', () => {
    it('happy path — correct via lemma', async () => {
      mockCardsService.findOwnedOrThrow.mockResolvedValue(mockExistingCard);

      const result = await service.checkTypedAnswer(
        'user-id-1',
        'card-id-1',
        'run into',
      );

      expect(result).toEqual({
        result: 'correct',
        matchedForm: 'run into',
        revealed: {
          lemma: 'run into',
          ipa: null,
          inflectionForms: { type: 'verb', base: 'run into', past: 'ran into' },
        },
      });
    });

    it('happy path — incorrect when nothing matches', async () => {
      mockCardsService.findOwnedOrThrow.mockResolvedValue(mockExistingCard);

      const result = await service.checkTypedAnswer(
        'user-id-1',
        'card-id-1',
        'walk away',
      );

      expect(result).toEqual({
        result: 'incorrect',
        matchedForm: null,
        revealed: null,
      });
    });

    it('edge case — card not found throws CardNotFoundError', async () => {
      mockCardsService.findOwnedOrThrow.mockRejectedValue(
        new CardNotFoundError(),
      );

      await expect(
        service.checkTypedAnswer('user-id-1', 'card-id-1', 'run into'),
      ).rejects.toBeInstanceOf(CardNotFoundError);
    });

    it('edge case — an inflection card throws UnsupportedCardTypeError', async () => {
      mockCardsService.findOwnedOrThrow.mockResolvedValue(mockInflectionCard);

      await expect(
        service.checkTypedAnswer('user-id-1', 'card-id-2', 'run'),
      ).rejects.toBeInstanceOf(UnsupportedCardTypeError);
    });
  });

  describe('checkForms()', () => {
    it('happy path — reports per-form correctness without affecting scheduling', async () => {
      mockCardsService.findOwnedOrThrow.mockResolvedValue(mockInflectionCard);

      const result = await service.checkForms('user-id-1', 'card-id-2', {
        base: 'run',
        past: 'runned',
        present3sg: 'runs',
      });

      expect(result.results.base).toEqual({
        typed: 'run',
        expected: 'run',
        correct: true,
      });
      expect(result.results.past).toEqual({
        typed: 'runned',
        expected: 'ran',
        correct: false,
      });
      expect(result.allCorrect).toBe(false);
      expect(result.revealed.lemma).toBe('run into');
    });

    it('edge case — an inflection card with no stored paradigm throws UnsupportedCardTypeError', async () => {
      mockCardsService.findOwnedOrThrow.mockResolvedValue({
        ...mockInflectionCard,
        inflectionForms: null,
      });

      await expect(
        service.checkForms('user-id-1', 'card-id-2', { base: 'run' }),
      ).rejects.toBeInstanceOf(UnsupportedCardTypeError);
    });

    it('edge case — an existing card throws UnsupportedCardTypeError', async () => {
      mockCardsService.findOwnedOrThrow.mockResolvedValue(mockExistingCard);

      await expect(
        service.checkForms('user-id-1', 'card-id-1', { base: 'run' }),
      ).rejects.toBeInstanceOf(UnsupportedCardTypeError);
    });

    it('edge case — card not found throws CardNotFoundError', async () => {
      mockCardsService.findOwnedOrThrow.mockRejectedValue(
        new CardNotFoundError(),
      );

      await expect(
        service.checkForms('user-id-1', 'card-id-2', { base: 'run' }),
      ).rejects.toBeInstanceOf(CardNotFoundError);
    });
  });

  describe('gradeCard()', () => {
    it("happy path — schedules from the card's own persisted FSRS state and writes both rows in a transaction", async () => {
      const dueAt = new Date(NOW.getTime() + 10 * MS_PER_MINUTE);
      mockCardsService.findOwnedOrThrow.mockResolvedValue(mockExistingCard);
      mockCardsService.buildGradeUpdate.mockReturnValue(
        Promise.resolve({
          ...mockExistingCard,
          state: 'review',
          scheduledDays: 15,
          dueAt,
        }),
      );
      mockPrismaService.reviewLog.create.mockResolvedValue({});

      const result = await service.gradeCard('user-id-1', 'card-id-1', {
        rating: 'good',
      });

      expect(result).toEqual({
        nextDueAt: dueAt,
        intervalDays: 15,
        state: 'review',
      });
      expect(mockPrismaService.$transaction).toHaveBeenCalledTimes(1);
      expect(mockCardsService.buildGradeUpdate).toHaveBeenCalledWith(
        'card-id-1',
        expect.objectContaining({ state: expect.any(String) as string }),
      );
      expect(mockPrismaService.reviewLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({
            cardId: 'card-id-1',
            rating: 'good',
            typedAnswer: null,
            answerResult: null,
            stateBefore: 'review',
            previousIntervalDays: 10,
          }),
        }),
      );
    });

    it('happy path — self-rated inflection card persists typedForms for feedback/training data', async () => {
      mockCardsService.findOwnedOrThrow.mockResolvedValue(mockInflectionCard);
      mockCardsService.buildGradeUpdate.mockReturnValue(
        Promise.resolve({ ...mockInflectionCard, state: 'review' }),
      );
      mockPrismaService.reviewLog.create.mockResolvedValue({});

      await service.gradeCard('user-id-1', 'card-id-2', {
        rating: 'easy',
        typedForms: { base: 'run', past: 'ran' },
      });

      expect(mockPrismaService.reviewLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({
            cardId: 'card-id-2',
            rating: 'easy',
            typedForms: { base: 'run', past: 'ran' },
          }),
        }),
      );
    });

    it('happy path — persists typedAnswer and answerResult when provided', async () => {
      mockCardsService.findOwnedOrThrow.mockResolvedValue(mockExistingCard);
      mockCardsService.buildGradeUpdate.mockReturnValue(
        Promise.resolve(mockExistingCard),
      );
      mockPrismaService.reviewLog.create.mockResolvedValue({});

      await service.gradeCard('user-id-1', 'card-id-1', {
        rating: 'good',
        typedAnswer: 'run into',
        answerResult: 'correct',
      });

      expect(mockPrismaService.reviewLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({
            typedAnswer: 'run into',
            answerResult: 'correct',
          }),
        }),
      );
    });

    it('edge case — card not found throws CardNotFoundError before touching scheduling', async () => {
      mockCardsService.findOwnedOrThrow.mockRejectedValue(
        new CardNotFoundError(),
      );

      await expect(
        service.gradeCard('user-id-1', 'card-id-1', { rating: 'good' }),
      ).rejects.toBeInstanceOf(CardNotFoundError);

      expect(mockCardsService.buildGradeUpdate).not.toHaveBeenCalled();
      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
    });
  });
});
