import { Test, TestingModule } from '@nestjs/testing';
import type {
  Card,
  CardAnkiDroidExport,
  CardReviewState,
  Definition,
  Deck,
  Word,
} from '@prisma/client';
import { MS_PER_MINUTE } from '../core/time/time.constants';
import { PrismaService } from '../core/prisma/prisma.service';
import { CardsService } from '../cards/cards.service';
import { CardNotFoundError } from '../cards/cards.errors';
import { DecksService } from '../decks/decks.service';
import { DeckNotFoundError } from '../decks/decks.errors';
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

const mockCard: Card = {
  id: 'card-id-1',
  deckId: 'deck-id-1',
  userId: 'user-id-1',
  definitionId: 'def-id-1',
  context: 'Guess who I ran into at the station!',
  inflectionForms: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

const mockCardWithDefinitionAndWord = {
  ...mockCard,
  definition: { ...mockDefinition, word: mockWord },
};

const mockCardWithAnkiDroidExport = {
  ...mockCardWithDefinitionAndWord,
  ankidroidExport: null as CardAnkiDroidExport | null,
};

const mockCardWithDeck = {
  ...mockCardWithDefinitionAndWord,
  deck: { id: mockDeck.id, name: mockDeck.name },
};

const mockReviewState: CardReviewState = {
  id: 'state-id-1',
  cardId: 'card-id-1',
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
};

const mockPrismaService = {
  cardReviewState: {
    count: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    upsert: jest.fn(),
  },
  reviewLog: {
    create: jest.fn(),
  },
  $transaction: jest.fn(
    async (ops: unknown[]): Promise<unknown[]> => Promise.all(ops),
  ),
};

const mockCardsService = {
  findOwnedOrThrow: jest.fn(),
  findCardsWithoutReviewState: jest.fn(),
};

const mockDecksService = {
  findOneOrThrow: jest.fn(),
};

describe('ReviewsService', () => {
  let service: ReviewsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(NOW);

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
      mockPrismaService.cardReviewState.count.mockResolvedValue(5);
      mockCardsService.findCardsWithoutReviewState.mockResolvedValue([
        mockCardWithDeck,
        mockCardWithDeck,
        mockCardWithDeck,
      ]);

      const result = await service.getSummary('user-id-1');

      expect(result).toEqual({ dueCount: 5, newCount: 3 });
      expect(mockPrismaService.cardReviewState.count).toHaveBeenCalledWith({
        where: { dueAt: { lte: NOW }, card: { userId: 'user-id-1' } },
      });
      expect(mockCardsService.findCardsWithoutReviewState).toHaveBeenCalledWith(
        'user-id-1',
      );
    });

    it('edge case — zero due and zero new', async () => {
      mockPrismaService.cardReviewState.count.mockResolvedValue(0);
      mockCardsService.findCardsWithoutReviewState.mockResolvedValue([]);

      const result = await service.getSummary('user-id-1');

      expect(result).toEqual({ dueCount: 0, newCount: 0 });
    });
  });

  describe('getQueue()', () => {
    it('happy path — due items ordered before new items, truncated to limit', async () => {
      mockPrismaService.cardReviewState.findMany.mockResolvedValue([
        { ...mockReviewState, card: mockCardWithDeck },
      ]);
      mockCardsService.findCardsWithoutReviewState.mockResolvedValue([
        mockCardWithDeck,
      ]);

      const result = await service.getQueue('user-id-1', { limit: 20 });

      expect(result).toHaveLength(2);
      expect(result[0]?.isNew).toBe(false);
      expect(result[1]?.isNew).toBe(true);
      expect(mockPrismaService.cardReviewState.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            dueAt: { lte: NOW },
            card: { userId: 'user-id-1' },
          },
          orderBy: { dueAt: 'asc' },
          take: 20,
        }),
      );
      expect(mockCardsService.findCardsWithoutReviewState).toHaveBeenCalledWith(
        'user-id-1',
        undefined,
        19,
      );
    });

    it('limit truncation — does not query new cards when due items already fill the limit', async () => {
      mockPrismaService.cardReviewState.findMany.mockResolvedValue([
        { ...mockReviewState, card: mockCardWithDeck },
      ]);

      const result = await service.getQueue('user-id-1', { limit: 1 });

      expect(result).toHaveLength(1);
      expect(result[0]?.isNew).toBe(false);
      expect(
        mockCardsService.findCardsWithoutReviewState,
      ).not.toHaveBeenCalled();
    });

    it('deck filter — validates ownership and filters both due and new queries by deckId', async () => {
      mockDecksService.findOneOrThrow.mockResolvedValue(mockDeck);
      mockPrismaService.cardReviewState.findMany.mockResolvedValue([]);
      mockCardsService.findCardsWithoutReviewState.mockResolvedValue([]);

      await service.getQueue('user-id-1', {
        deckId: 'deck-id-1',
        limit: 20,
      });

      expect(mockDecksService.findOneOrThrow).toHaveBeenCalledWith(
        'deck-id-1',
        'user-id-1',
      );
      expect(mockPrismaService.cardReviewState.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            dueAt: { lte: NOW },
            card: { userId: 'user-id-1', deckId: 'deck-id-1' },
          },
        }),
      );
      expect(mockCardsService.findCardsWithoutReviewState).toHaveBeenCalledWith(
        'user-id-1',
        'deck-id-1',
        20,
      );
    });

    it('edge case — deck not owned by user throws DeckNotFoundError, no queries run', async () => {
      mockDecksService.findOneOrThrow.mockRejectedValue(
        new DeckNotFoundError(),
      );

      await expect(
        service.getQueue('user-id-1', { deckId: 'deck-id-other', limit: 20 }),
      ).rejects.toBeInstanceOf(DeckNotFoundError);

      expect(mockPrismaService.cardReviewState.findMany).not.toHaveBeenCalled();
    });

    it('prompt building — masks the captured context, derives kind/partOfSpeech/lemmaLength', async () => {
      mockPrismaService.cardReviewState.findMany.mockResolvedValue([
        { ...mockReviewState, card: mockCardWithDeck },
      ]);
      mockCardsService.findCardsWithoutReviewState.mockResolvedValue([]);

      const result = await service.getQueue('user-id-1', { limit: 20 });

      expect(result[0]).toMatchObject({
        cardId: 'card-id-1',
        deckId: 'deck-id-1',
        deckName: 'English basics',
        isNew: false,
        prompt: {
          definition: 'To encounter unexpectedly.',
          maskedSentence: 'Guess who I ____ at the station!',
          partOfSpeech: 'verb',
          kind: 'phrasal_verb',
          lemmaLength: 'run into'.length,
          language: 'en',
        },
      });
    });

    it('prompt building — prompt.language reflects the card word language (Spanish)', async () => {
      const spanishWord: Word = {
        ...mockWord,
        language: 'es',
        lemma: 'correr',
      };
      const spanishCardWithDeck = {
        ...mockCardWithDeck,
        definition: { ...mockDefinition, word: spanishWord },
      };
      mockPrismaService.cardReviewState.findMany.mockResolvedValue([
        { ...mockReviewState, card: spanishCardWithDeck },
      ]);
      mockCardsService.findCardsWithoutReviewState.mockResolvedValue([]);

      const result = await service.getQueue('user-id-1', { limit: 20 });

      expect(result[0]?.prompt.language).toBe('es');
    });
  });

  describe('checkTypedAnswer()', () => {
    it('happy path — correct via lemma', async () => {
      mockCardsService.findOwnedOrThrow.mockResolvedValue(
        mockCardWithAnkiDroidExport,
      );

      const result = await service.checkTypedAnswer(
        'user-id-1',
        'card-id-1',
        'run into',
      );

      expect(result).toEqual({
        result: 'correct',
        matchedForm: 'run into',
      });
    });

    it('happy path — correct via inflection form', async () => {
      mockCardsService.findOwnedOrThrow.mockResolvedValue(
        mockCardWithAnkiDroidExport,
      );

      const result = await service.checkTypedAnswer(
        'user-id-1',
        'card-id-1',
        'ran into',
      );

      expect(result).toEqual({
        result: 'correct',
        matchedForm: 'ran into',
      });
    });

    it('happy path — incorrect when nothing matches', async () => {
      mockCardsService.findOwnedOrThrow.mockResolvedValue(
        mockCardWithAnkiDroidExport,
      );

      const result = await service.checkTypedAnswer(
        'user-id-1',
        'card-id-1',
        'walk away',
      );

      expect(result).toEqual({
        result: 'incorrect',
        matchedForm: null,
      });
    });

    it('edge case — case/whitespace-insensitive correct match', async () => {
      mockCardsService.findOwnedOrThrow.mockResolvedValue(
        mockCardWithAnkiDroidExport,
      );

      const result = await service.checkTypedAnswer(
        'user-id-1',
        'card-id-1',
        '  RUN   INTO  ',
      );

      expect(result.result).toBe('correct');
    });

    it('edge case — card not found throws CardNotFoundError', async () => {
      mockCardsService.findOwnedOrThrow.mockRejectedValue(
        new CardNotFoundError(),
      );

      await expect(
        service.checkTypedAnswer('user-id-1', 'card-id-1', 'run into'),
      ).rejects.toBeInstanceOf(CardNotFoundError);
    });
  });

  describe('gradeCard()', () => {
    it('happy path — starts an unseen card from FSRS defaults and writes both rows in a transaction', async () => {
      const dueAt = new Date(NOW.getTime() + 10 * MS_PER_MINUTE);
      mockCardsService.findOwnedOrThrow.mockResolvedValue(
        mockCardWithAnkiDroidExport,
      );
      mockPrismaService.cardReviewState.findUnique.mockResolvedValue(null);
      mockPrismaService.cardReviewState.upsert.mockResolvedValue({
        ...mockReviewState,
        state: 'learning',
        scheduledDays: 0,
        reps: 1,
        lapses: 0,
        dueAt,
      });
      mockPrismaService.reviewLog.create.mockResolvedValue({});

      const result = await service.gradeCard('user-id-1', 'card-id-1', {
        rating: 'good',
      });

      expect(result).toEqual({
        nextDueAt: dueAt,
        intervalDays: 0,
        state: 'learning',
      });
      expect(mockPrismaService.$transaction).toHaveBeenCalledTimes(1);
      expect(mockPrismaService.cardReviewState.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { cardId: 'card-id-1' },
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          create: expect.objectContaining({
            cardId: 'card-id-1',
            state: 'learning',
            scheduledDays: 0,
            reps: 1,
            lapses: 0,
            dueAt,
          }),
        }),
      );
      expect(mockPrismaService.reviewLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({
            cardId: 'card-id-1',
            rating: 'good',
            typedAnswer: null,
            answerResult: null,
            stateBefore: 'new',
            previousIntervalDays: 0,
            newIntervalDays: 0,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            stabilityAfter: expect.closeTo(2.3065, 3),
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            difficultyAfter: expect.closeTo(2.1181, 3),
          }),
        }),
      );
    });

    it('happy path — continues scheduling from an existing review state', async () => {
      mockCardsService.findOwnedOrThrow.mockResolvedValue(
        mockCardWithAnkiDroidExport,
      );
      mockPrismaService.cardReviewState.findUnique.mockResolvedValue(
        mockReviewState,
      );
      mockPrismaService.cardReviewState.upsert.mockResolvedValue({
        ...mockReviewState,
        scheduledDays: 35,
        reps: 4,
      });
      mockPrismaService.reviewLog.create.mockResolvedValue({});

      await service.gradeCard('user-id-1', 'card-id-1', { rating: 'good' });

      expect(mockPrismaService.cardReviewState.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          update: expect.objectContaining({
            state: 'review',
            scheduledDays: 35,
            reps: 4,
          }),
        }),
      );
      expect(mockPrismaService.reviewLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({
            stateBefore: 'review',
            previousIntervalDays: 10,
            newIntervalDays: 35,
          }),
        }),
      );
    });

    it('happy path — persists typedAnswer and answerResult when provided', async () => {
      mockCardsService.findOwnedOrThrow.mockResolvedValue(
        mockCardWithAnkiDroidExport,
      );
      mockPrismaService.cardReviewState.findUnique.mockResolvedValue(null);
      mockPrismaService.cardReviewState.upsert.mockResolvedValue(
        mockReviewState,
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

    it('edge case — card not found throws CardNotFoundError before touching review state', async () => {
      mockCardsService.findOwnedOrThrow.mockRejectedValue(
        new CardNotFoundError(),
      );

      await expect(
        service.gradeCard('user-id-1', 'card-id-1', { rating: 'good' }),
      ).rejects.toBeInstanceOf(CardNotFoundError);

      expect(
        mockPrismaService.cardReviewState.findUnique,
      ).not.toHaveBeenCalled();
      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
    });
  });
});
