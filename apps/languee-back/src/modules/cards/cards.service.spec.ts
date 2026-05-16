import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../core/prisma/prisma.service';
import { CardsService } from './cards.service';
import {
  CardAlreadyExistsError,
  DeckOwnershipError,
  DefinitionNotFoundError,
} from './cards.errors';
import type { Card, Definition, Word } from '@prisma/client';

const mockWord: Word = {
  id: 'word-id-1',
  lemma: 'run',
  language: 'en',
  ipa: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
};

const mockDefinition: Definition = {
  id: 'def-id-1',
  wordId: 'word-id-1',
  partOfSpeech: 'verb',
  definition: 'to move at a speed faster than walking',
  example: 'She runs every morning.',
  provider: 'free-dictionary',
  gapFillMetadata: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
};

const mockCard: Card = {
  id: 'card-id-1',
  deckId: 'deck-id-1',
  userId: 'user-id-1',
  definitionId: 'def-id-1',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

const mockCardWithRelations = {
  ...mockCard,
  definition: { ...mockDefinition, word: mockWord },
};

const mockPrismaService = {
  card: {
    create: jest.fn(),
  },
};

describe('CardsService', () => {
  let service: CardsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CardsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<CardsService>(CardsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create()', () => {
    it('happy path — returns card with definition and word relations', async () => {
      mockPrismaService.card.create.mockResolvedValue(mockCardWithRelations);

      const result = await service.create('user-id-1', 'deck-id-1', 'def-id-1');

      expect(result).toEqual(mockCardWithRelations);
      expect(result.definition).toBeDefined();
      expect(result.definition.word).toBeDefined();
      expect(result.definition.word.lemma).toBe('run');
      expect(result.definition.word.language).toBe('en');
      expect(mockPrismaService.card.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-id-1',
          deckId: 'deck-id-1',
          definitionId: 'def-id-1',
        },
        include: { definition: { include: { word: true } } },
      });
    });

    it('edge case — duplicate deckId+definitionId throws CardAlreadyExistsError on P2002', async () => {
      const prismaError = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        { code: 'P2002', clientVersion: '6.0.0' },
      );
      mockPrismaService.card.create.mockRejectedValue(prismaError);

      await expect(
        service.create('user-id-1', 'deck-id-1', 'def-id-1'),
      ).rejects.toBeInstanceOf(CardAlreadyExistsError);
    });

    it('edge case — missing definitionId FK (P2003 with definition_id in field_name) throws DefinitionNotFoundError', async () => {
      const prismaError = new Prisma.PrismaClientKnownRequestError(
        'Foreign key constraint failed on the field: `definition_id`',
        {
          code: 'P2003',
          clientVersion: '6.0.0',
          meta: { field_name: 'cards_definition_id_fkey (index)' },
        },
      );
      mockPrismaService.card.create.mockRejectedValue(prismaError);

      await expect(
        service.create('user-id-1', 'deck-id-1', 'nonexistent-def-id'),
      ).rejects.toBeInstanceOf(DefinitionNotFoundError);
    });

    it('edge case — missing deckId FK (P2003 without definition_id in field_name) throws DeckOwnershipError', async () => {
      const prismaError = new Prisma.PrismaClientKnownRequestError(
        'Foreign key constraint failed on the field: `deck_id`',
        {
          code: 'P2003',
          clientVersion: '6.0.0',
          meta: { field_name: 'cards_deck_id_fkey (index)' },
        },
      );
      mockPrismaService.card.create.mockRejectedValue(prismaError);

      await expect(
        service.create('user-id-1', 'nonexistent-deck-id', 'def-id-1'),
      ).rejects.toBeInstanceOf(DeckOwnershipError);
    });

    it('edge case — unexpected non-Prisma error is re-thrown', async () => {
      const unexpectedError = new Error('Network failure');
      mockPrismaService.card.create.mockRejectedValue(unexpectedError);

      await expect(
        service.create('user-id-1', 'deck-id-1', 'def-id-1'),
      ).rejects.toThrow('Network failure');
    });

    it('edge case — P2003 with empty field_name meta throws DeckOwnershipError (not DefinitionNotFoundError)', async () => {
      const prismaError = new Prisma.PrismaClientKnownRequestError(
        'Foreign key constraint failed',
        {
          code: 'P2003',
          clientVersion: '6.0.0',
          meta: {},
        },
      );
      mockPrismaService.card.create.mockRejectedValue(prismaError);

      await expect(
        service.create('user-id-1', 'deck-id-1', 'def-id-1'),
      ).rejects.toBeInstanceOf(DeckOwnershipError);
    });
  });
});
