import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../core/prisma/prisma.service';
import { DecksService } from '../decks/decks.service';
import { DeckNotFoundError } from '../decks/decks.errors';
import { DefinitionService } from '../definitions/definitions.service';
import { CardsService } from './cards.service';
import {
  CardAlreadyExistsError,
  CardNotFoundError,
  DefinitionNotFoundError,
} from './cards.errors';
import type { Card, Deck, Word } from '@prisma/client';
import type { DefinitionWithWord } from '../definitions/definitions.service';

const mockDeck: Deck = {
  id: 'deck-id-1',
  userId: 'user-id-1',
  name: 'My Deck',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

const mockWord: Word = {
  id: 'word-id-1',
  lemma: 'run',
  language: 'en',
  ipa: null,
  kind: 'word',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
};

const mockDefinition: DefinitionWithWord = {
  id: 'def-id-1',
  wordId: 'word-id-1',
  partOfSpeech: 'verb',
  definition: 'to move at a speed faster than walking',
  example: 'She runs every morning.',
  provider: 'free-dictionary',
  gapFillMetadata: null,
  hasIrregularForms: false,
  inflectionForms: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  word: mockWord,
};

const mockDefinitionInflecting: DefinitionWithWord = {
  ...mockDefinition,
  id: 'def-id-2',
  inflectionForms: {
    type: 'verb',
    base: 'run',
    past: 'ran',
    present3sg: 'runs',
  },
};

function baseCard(overrides: Partial<Card>): Card {
  return {
    id: 'card-id-x',
    type: 'existing',
    userId: 'user-id-1',
    definitionId: null,
    wordId: null,
    partOfSpeech: null,
    context: null,
    inflectionForms: null,
    state: 'new',
    dueAt: new Date('2026-01-01T00:00:00.000Z'),
    stability: 0,
    difficulty: 0,
    scheduledDays: 0,
    learningSteps: 0,
    reps: 0,
    lapses: 0,
    lastReviewedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

const mockExistingCard = baseCard({
  id: 'card-id-existing',
  type: 'existing',
  definitionId: 'def-id-1',
});
const mockDefinitionCard = baseCard({
  id: 'card-id-definition',
  type: 'definition',
  definitionId: 'def-id-1',
});
const mockInflectionCard = baseCard({
  id: 'card-id-inflection',
  type: 'inflection',
  wordId: 'word-id-1',
  partOfSpeech: 'verb',
  inflectionForms: mockDefinitionInflecting.inflectionForms,
});

function withRelations(card: Card, deckId?: string) {
  return {
    ...card,
    definition: card.definitionId
      ? { ...mockDefinition, word: mockWord }
      : null,
    word: card.wordId ? mockWord : null,
    decks: deckId ? [{ deck: { id: deckId, name: mockDeck.name } }] : [],
  };
}

const mockTx = {
  card: {
    findUnique: jest.fn(),
    create: jest.fn(),
    findUniqueOrThrow: jest.fn(),
  },
  cardDeck: {
    findUnique: jest.fn(),
    createMany: jest.fn(),
  },
};

const mockPrismaService = {
  card: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
  },
  $transaction: jest.fn(async (arg: unknown): Promise<unknown> =>
    typeof arg === 'function'
      ? (arg as (tx: typeof mockTx) => Promise<unknown>)(mockTx)
      : Promise.all(arg as unknown[]),
  ),
};

const mockDecksService = {
  findOneOrThrow: jest.fn(),
};

const mockDefinitionService = {
  findByIdWithWord: jest.fn(),
};

describe('CardsService', () => {
  let service: CardsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CardsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: DecksService, useValue: mockDecksService },
        { provide: DefinitionService, useValue: mockDefinitionService },
      ],
    }).compile();

    service = module.get<CardsService>(CardsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create()', () => {
    it('happy path — a non-inflecting word yields existing + definition cards only', async () => {
      mockDecksService.findOneOrThrow.mockResolvedValue(mockDeck);
      mockDefinitionService.findByIdWithWord.mockResolvedValue(mockDefinition);
      mockTx.card.findUnique
        .mockResolvedValueOnce(null) // existing card lookup
        .mockResolvedValueOnce(null); // definition card lookup
      mockTx.card.create
        .mockResolvedValueOnce(mockExistingCard)
        .mockResolvedValueOnce(mockDefinitionCard);
      mockTx.cardDeck.findUnique.mockResolvedValue(null);
      mockTx.cardDeck.createMany.mockResolvedValue({ count: 2 });
      mockPrismaService.card.findMany.mockResolvedValue([
        withRelations(mockExistingCard, 'deck-id-1'),
        withRelations(mockDefinitionCard, 'deck-id-1'),
      ]);

      const result = await service.create('user-id-1', 'deck-id-1', 'def-id-1');

      expect(result).toHaveLength(2);
      expect(result.map((c) => c.type)).toEqual(['existing', 'definition']);
      expect(mockDecksService.findOneOrThrow).toHaveBeenCalledWith(
        'deck-id-1',
        'user-id-1',
      );
      expect(mockTx.cardDeck.createMany).toHaveBeenCalledWith({
        data: [
          { cardId: 'card-id-existing', deckId: 'deck-id-1' },
          { cardId: 'card-id-definition', deckId: 'deck-id-1' },
        ],
        skipDuplicates: true,
      });
    });

    it('happy path — an inflecting word additionally yields a shared inflection card', async () => {
      mockDecksService.findOneOrThrow.mockResolvedValue(mockDeck);
      mockDefinitionService.findByIdWithWord.mockResolvedValue(
        mockDefinitionInflecting,
      );
      mockTx.card.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      mockTx.card.create
        .mockResolvedValueOnce(mockExistingCard)
        .mockResolvedValueOnce(mockDefinitionCard)
        .mockResolvedValueOnce(mockInflectionCard);
      mockTx.cardDeck.findUnique.mockResolvedValue(null);
      mockTx.cardDeck.createMany.mockResolvedValue({ count: 3 });
      mockPrismaService.card.findMany.mockResolvedValue([
        withRelations(mockExistingCard, 'deck-id-1'),
        withRelations(mockDefinitionCard, 'deck-id-1'),
        withRelations(mockInflectionCard, 'deck-id-1'),
      ]);

      const result = await service.create('user-id-1', 'deck-id-1', 'def-id-2');

      expect(result.map((c) => c.type)).toEqual([
        'existing',
        'definition',
        'inflection',
      ]);
    });

    it('happy path — reuses cards already generated for the definition, only joining the new deck', async () => {
      mockDecksService.findOneOrThrow.mockResolvedValue(mockDeck);
      mockDefinitionService.findByIdWithWord.mockResolvedValue(mockDefinition);
      mockTx.card.findUnique
        .mockResolvedValueOnce(mockExistingCard) // already exists
        .mockResolvedValueOnce(mockDefinitionCard); // already exists
      mockTx.cardDeck.findUnique.mockResolvedValue(null); // not yet in THIS deck
      mockTx.cardDeck.createMany.mockResolvedValue({ count: 2 });
      mockPrismaService.card.findMany.mockResolvedValue([
        withRelations(mockExistingCard, 'deck-id-2'),
        withRelations(mockDefinitionCard, 'deck-id-2'),
      ]);

      await service.create('user-id-1', 'deck-id-2', 'def-id-1');

      expect(mockTx.card.create).not.toHaveBeenCalled();
      expect(mockTx.cardDeck.createMany).toHaveBeenCalledWith({
        data: [
          { cardId: 'card-id-existing', deckId: 'deck-id-2' },
          { cardId: 'card-id-definition', deckId: 'deck-id-2' },
        ],
        skipDuplicates: true,
      });
    });

    it('edge case — concurrent creation (P2002) on a sense card re-fetches instead of failing', async () => {
      mockDecksService.findOneOrThrow.mockResolvedValue(mockDeck);
      mockDefinitionService.findByIdWithWord.mockResolvedValue(mockDefinition);
      const prismaError = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        { code: 'P2002', clientVersion: '7.9.1' },
      );
      mockTx.card.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      mockTx.card.create.mockRejectedValueOnce(prismaError);
      mockTx.card.findUniqueOrThrow.mockResolvedValueOnce(mockExistingCard);
      mockTx.cardDeck.findUnique.mockResolvedValue(null);
      mockTx.card.create.mockResolvedValueOnce(mockDefinitionCard);
      mockTx.cardDeck.createMany.mockResolvedValue({ count: 2 });
      mockPrismaService.card.findMany.mockResolvedValue([
        withRelations(mockExistingCard, 'deck-id-1'),
        withRelations(mockDefinitionCard, 'deck-id-1'),
      ]);

      const result = await service.create('user-id-1', 'deck-id-1', 'def-id-1');

      expect(mockTx.card.findUniqueOrThrow).toHaveBeenCalled();
      expect(result).toHaveLength(2);
    });

    it('edge case — concurrent creation (P2002) on the inflection card re-fetches instead of failing', async () => {
      mockDecksService.findOneOrThrow.mockResolvedValue(mockDeck);
      mockDefinitionService.findByIdWithWord.mockResolvedValue(
        mockDefinitionInflecting,
      );
      const prismaError = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        { code: 'P2002', clientVersion: '7.9.1' },
      );
      mockTx.card.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      mockTx.card.create
        .mockResolvedValueOnce(mockExistingCard)
        .mockResolvedValueOnce(mockDefinitionCard)
        .mockRejectedValueOnce(prismaError);
      mockTx.card.findUniqueOrThrow.mockResolvedValueOnce(mockInflectionCard);
      mockTx.cardDeck.findUnique.mockResolvedValue(null);
      mockTx.cardDeck.createMany.mockResolvedValue({ count: 3 });
      mockPrismaService.card.findMany.mockResolvedValue([
        withRelations(mockExistingCard, 'deck-id-1'),
        withRelations(mockDefinitionCard, 'deck-id-1'),
        withRelations(mockInflectionCard, 'deck-id-1'),
      ]);

      const result = await service.create('user-id-1', 'deck-id-1', 'def-id-2');

      expect(mockTx.card.findUniqueOrThrow).toHaveBeenCalled();
      expect(result).toHaveLength(3);
    });

    it('edge case — an unexpected error from card.create is re-thrown, not swallowed', async () => {
      mockDecksService.findOneOrThrow.mockResolvedValue(mockDeck);
      mockDefinitionService.findByIdWithWord.mockResolvedValue(mockDefinition);
      mockTx.card.findUnique.mockResolvedValueOnce(null);
      mockTx.card.create.mockRejectedValueOnce(new Error('Network failure'));

      await expect(
        service.create('user-id-1', 'deck-id-1', 'def-id-1'),
      ).rejects.toThrow('Network failure');
    });

    it('edge case — deckId not owned by user throws DeckNotFoundError before any card work', async () => {
      mockDecksService.findOneOrThrow.mockRejectedValue(
        new DeckNotFoundError(),
      );

      await expect(
        service.create('user-id-1', 'deck-id-other', 'def-id-1'),
      ).rejects.toBeInstanceOf(DeckNotFoundError);

      expect(mockDefinitionService.findByIdWithWord).not.toHaveBeenCalled();
    });

    it('edge case — unknown definitionId throws DefinitionNotFoundError', async () => {
      mockDecksService.findOneOrThrow.mockResolvedValue(mockDeck);
      mockDefinitionService.findByIdWithWord.mockResolvedValue(null);

      await expect(
        service.create('user-id-1', 'deck-id-1', 'nonexistent-def'),
      ).rejects.toBeInstanceOf(DefinitionNotFoundError);

      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
    });

    it('edge case — the same definition already saved in this exact deck throws CardAlreadyExistsError', async () => {
      mockDecksService.findOneOrThrow.mockResolvedValue(mockDeck);
      mockDefinitionService.findByIdWithWord.mockResolvedValue(mockDefinition);
      mockTx.card.findUnique.mockResolvedValueOnce(mockExistingCard);
      mockTx.cardDeck.findUnique.mockResolvedValueOnce({
        id: 'join-1',
        cardId: mockExistingCard.id,
        deckId: 'deck-id-1',
        createdAt: new Date(),
      });

      await expect(
        service.create('user-id-1', 'deck-id-1', 'def-id-1'),
      ).rejects.toBeInstanceOf(CardAlreadyExistsError);

      expect(mockTx.card.create).not.toHaveBeenCalled();
    });
  });

  describe('findManyByUserId()', () => {
    it('happy path — returns all cards for user with no filters', async () => {
      mockPrismaService.card.findMany.mockResolvedValue([
        withRelations(mockExistingCard, 'deck-id-1'),
      ]);

      const result = await service.findManyByUserId('user-id-1');

      expect(result).toHaveLength(1);
      expect(mockPrismaService.card.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-id-1' } }),
      );
    });

    it('filter — deckId filters via the card_decks join', async () => {
      mockPrismaService.card.findMany.mockResolvedValue([]);

      await service.findManyByUserId('user-id-1', { deckId: 'deck-id-1' });

      expect(mockPrismaService.card.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          where: expect.objectContaining({
            userId: 'user-id-1',
            decks: { some: { deckId: 'deck-id-1' } },
          }),
        }),
      );
    });

    it('filter — ankiDroidExportStatus=none uses Prisma is:null relation filter', async () => {
      mockPrismaService.card.findMany.mockResolvedValue([]);

      await service.findManyByUserId('user-id-1', {
        ankiDroidExportStatus: 'none',
      });

      expect(mockPrismaService.card.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          where: expect.objectContaining({
            ankidroidExport: { is: null },
          }),
        }),
      );
    });

    it('filter — ankiDroidExportStatus=failed with failureReason combines both filters', async () => {
      mockPrismaService.card.findMany.mockResolvedValue([]);

      await service.findManyByUserId('user-id-1', {
        ankiDroidExportStatus: 'failed',
        failureReason: 'DECK_NOT_FOUND',
      });

      expect(mockPrismaService.card.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          where: expect.objectContaining({
            ankidroidExport: {
              is: { status: 'failed', failureReason: 'DECK_NOT_FOUND' },
            },
          }),
        }),
      );
    });

    it('filter — failureReason without ankiDroidExportStatus applies failureReason filter on relation', async () => {
      mockPrismaService.card.findMany.mockResolvedValue([]);

      await service.findManyByUserId('user-id-1', {
        failureReason: 'DECK_NOT_FOUND',
      });

      expect(mockPrismaService.card.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          where: expect.objectContaining({
            ankidroidExport: { is: { failureReason: 'DECK_NOT_FOUND' } },
          }),
        }),
      );
    });

    it('edge case — no cards returns empty array', async () => {
      mockPrismaService.card.findMany.mockResolvedValue([]);

      const result = await service.findManyByUserId('user-id-1');

      expect(result).toEqual([]);
    });
  });

  describe('findOneByIdAndUserId()', () => {
    it('happy path — returns the card flattened with deck refs', async () => {
      mockPrismaService.card.findFirst.mockResolvedValue({
        ...withRelations(mockExistingCard, 'deck-id-1'),
        ankidroidExport: null,
      });

      const result = await service.findOneByIdAndUserId(
        'card-id-existing',
        'user-id-1',
      );

      expect(result?.decks).toEqual([{ id: 'deck-id-1', name: 'My Deck' }]);
    });

    it('edge case — card not found returns null', async () => {
      mockPrismaService.card.findFirst.mockResolvedValue(null);

      const result = await service.findOneByIdAndUserId(
        'nonexistent-card',
        'user-id-1',
      );

      expect(result).toBeNull();
    });
  });

  describe('findOwnedOrThrow()', () => {
    it('happy path — returns card when found', async () => {
      mockPrismaService.card.findFirst.mockResolvedValue({
        ...withRelations(mockExistingCard, 'deck-id-1'),
        ankidroidExport: null,
      });

      const result = await service.findOwnedOrThrow(
        'card-id-existing',
        'user-id-1',
      );

      expect(result.id).toBe('card-id-existing');
    });

    it('edge case — card not found or not owned throws CardNotFoundError', async () => {
      mockPrismaService.card.findFirst.mockResolvedValue(null);

      await expect(
        service.findOwnedOrThrow('card-id-1', 'other-user'),
      ).rejects.toBeInstanceOf(CardNotFoundError);
    });
  });

  describe('findCardsByDefinitionIdsAndUserId()', () => {
    it('happy path — flattens one row per (definition, deck) for existing cards', async () => {
      mockPrismaService.card.findMany.mockResolvedValue([
        {
          definitionId: 'def-id-1',
          decks: [
            { deck: { id: 'deck-id-1', name: 'Deck A' } },
            { deck: { id: 'deck-id-2', name: 'Deck B' } },
          ],
        },
      ]);

      const result = await service.findCardsByDefinitionIdsAndUserId(
        ['def-id-1'],
        'user-id-1',
      );

      expect(result).toEqual([
        { definitionId: 'def-id-1', deck: { id: 'deck-id-1', name: 'Deck A' } },
        { definitionId: 'def-id-1', deck: { id: 'deck-id-2', name: 'Deck B' } },
      ]);
      expect(mockPrismaService.card.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            definitionId: { in: ['def-id-1'] },
            userId: 'user-id-1',
            type: 'existing',
          },
        }),
      );
    });

    it('edge case — no cards for user returns empty array', async () => {
      mockPrismaService.card.findMany.mockResolvedValue([]);

      const result = await service.findCardsByDefinitionIdsAndUserId(
        ['def-id-1'],
        'user-id-1',
      );

      expect(result).toEqual([]);
    });
  });

  describe('findDueCards()', () => {
    it('happy path — filters by due date and excludes new cards', async () => {
      const now = new Date('2026-07-02T12:00:00.000Z');
      mockPrismaService.card.findMany.mockResolvedValue([]);

      await service.findDueCards('user-id-1', undefined, now, 20);

      expect(mockPrismaService.card.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: 'user-id-1',
            state: { not: 'new' },
            dueAt: { lte: now },
          },
          orderBy: { dueAt: 'asc' },
          take: 20,
        }),
      );
    });

    it('edge case — deckId filters via the card_decks join', async () => {
      const now = new Date();
      mockPrismaService.card.findMany.mockResolvedValue([]);

      await service.findDueCards('user-id-1', 'deck-id-1', now, 20);

      expect(mockPrismaService.card.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          where: expect.objectContaining({
            decks: { some: { deckId: 'deck-id-1' } },
          }),
        }),
      );
    });
  });

  describe('findUnreviewedCards()', () => {
    it('happy path — filters to state new, oldest first', async () => {
      mockPrismaService.card.findMany.mockResolvedValue([]);

      await service.findUnreviewedCards('user-id-1');

      expect(mockPrismaService.card.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-id-1', state: 'new' },
          orderBy: { createdAt: 'asc' },
        }),
      );
    });

    it('edge case — a limit caps the query', async () => {
      mockPrismaService.card.findMany.mockResolvedValue([]);

      await service.findUnreviewedCards('user-id-1', 'deck-id-1', 5);

      expect(mockPrismaService.card.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 5 }),
      );
    });
  });

  describe('countDue() / countNew()', () => {
    it('countDue happy path — counts non-new cards due now', async () => {
      const now = new Date();
      mockPrismaService.card.count.mockResolvedValue(3);

      const result = await service.countDue('user-id-1', now);

      expect(result).toBe(3);
      expect(mockPrismaService.card.count).toHaveBeenCalledWith({
        where: {
          userId: 'user-id-1',
          state: { not: 'new' },
          dueAt: { lte: now },
        },
      });
    });

    it('countNew edge case — zero new cards', async () => {
      mockPrismaService.card.count.mockResolvedValue(0);

      const result = await service.countNew('user-id-1');

      expect(result).toBe(0);
    });
  });

  describe('findExistingCardContexts()', () => {
    it('happy path — maps definitionId to its existing card context', async () => {
      mockPrismaService.card.findMany.mockResolvedValue([
        { definitionId: 'def-id-1', context: 'I run every day.' },
        { definitionId: 'def-id-2', context: null },
      ]);

      const result = await service.findExistingCardContexts('user-id-1', [
        'def-id-1',
        'def-id-2',
      ]);

      expect(result.get('def-id-1')).toBe('I run every day.');
      expect(result.get('def-id-2')).toBeNull();
    });

    it('edge case — no matching cards returns an empty map', async () => {
      mockPrismaService.card.findMany.mockResolvedValue([]);

      const result = await service.findExistingCardContexts('user-id-1', [
        'def-id-1',
      ]);

      expect(result.size).toBe(0);
    });
  });

  describe('findSavedSensesByWordId()', () => {
    it('happy path — groups saved senses by wordId', async () => {
      mockPrismaService.card.findMany.mockResolvedValue([
        {
          definitionId: 'def-id-1',
          definition: { wordId: 'word-id-1', definition: 'to move fast' },
        },
        {
          definitionId: 'def-id-3',
          definition: { wordId: 'word-id-1', definition: 'to operate' },
        },
      ]);

      const result = await service.findSavedSensesByWordId('user-id-1', [
        'word-id-1',
      ]);

      expect(result.get('word-id-1')).toEqual([
        { definitionId: 'def-id-1', definition: 'to move fast' },
        { definitionId: 'def-id-3', definition: 'to operate' },
      ]);
    });

    it('edge case — no saved senses returns an empty map', async () => {
      mockPrismaService.card.findMany.mockResolvedValue([]);

      const result = await service.findSavedSensesByWordId('user-id-1', [
        'word-id-1',
      ]);

      expect(result.size).toBe(0);
    });
  });

  describe('buildGradeUpdate()', () => {
    it('happy path — delegates to prisma.card.update with the given data', () => {
      const data = {
        state: 'review' as const,
        dueAt: new Date('2026-07-10T00:00:00.000Z'),
        stability: 5,
        difficulty: 3,
        scheduledDays: 8,
        learningSteps: 0,
        reps: 2,
        lapses: 0,
        lastReviewedAt: new Date('2026-07-02T00:00:00.000Z'),
      };

      void service.buildGradeUpdate('card-id-1', data);

      expect(mockPrismaService.card.update).toHaveBeenCalledWith({
        where: { id: 'card-id-1' },
        data,
      });
    });
  });
});
