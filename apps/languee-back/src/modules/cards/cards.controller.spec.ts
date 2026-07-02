import { NotFoundException, ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CardsController } from './cards.controller';
import { CardsService } from './cards.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CardAlreadyExistsError,
  DeckOwnershipError,
  DefinitionNotFoundError,
} from './cards.errors';
import type { CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import type {
  CardWithAnkiDroidExport,
  CardWithDefinitionAndWord,
} from './cards.service';
import type {
  Card,
  CardAnkiDroidExport,
  Definition,
  Word,
} from '@prisma/client';
import type { InflectionForms } from '../dictionary/types/inflection-forms.types';

const mockUser: CurrentUserPayload = {
  userId: 'user-id-1',
  sessionId: 'session-id-1',
};

const mockWord: Word = {
  id: 'word-id-1',
  lemma: 'run',
  language: 'en',
  ipa: null,
  kind: 'word',
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
  hasIrregularForms: false,
  inflectionForms: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
};

const mockDefinitionWithInflections: Definition = {
  ...mockDefinition,
  inflectionForms: {
    type: 'verb',
    base: 'run',
    past: 'ran',
    pastParticiple: 'run',
    gerundParticiple: 'running',
    present3sg: 'runs',
    presentNon3sg: 'run',
  } satisfies InflectionForms,
};

const mockCard: Card = {
  id: 'card-id-1',
  deckId: 'deck-id-1',
  userId: 'user-id-1',
  definitionId: 'def-id-1',
  context: null,
  inflectionForms: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

const mockAnkiDroidExport: CardAnkiDroidExport = {
  id: 'export-id-1',
  cardId: 'card-id-1',
  status: 'pending',
  failureReason: null,
  failureMessage: null,
  ankiNoteId: null,
  ankiDeckId: null,
  ankiDeckNameSnapshot: null,
  ankiModelId: null,
  ankiModelNameSnapshot: null,
  templateVersion: null,
  lastAttemptedAt: null,
  completedAt: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

const mockCardWithDefinitionAndWord: CardWithDefinitionAndWord = {
  ...mockCard,
  definition: { ...mockDefinition, word: mockWord },
};

const mockCardWithAnkiDroidExport: CardWithAnkiDroidExport = {
  ...mockCard,
  definition: { ...mockDefinition, word: mockWord },
  ankidroidExport: null,
};

const mockCardWithExport: CardWithAnkiDroidExport = {
  ...mockCard,
  definition: { ...mockDefinition, word: mockWord },
  ankidroidExport: mockAnkiDroidExport,
};

const mockCardsService = {
  create: jest.fn(),
  findManyByUserId: jest.fn(),
  findOneByIdAndUserId: jest.fn(),
};

describe('CardsController', () => {
  let controller: CardsController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CardsController],
      providers: [{ provide: CardsService, useValue: mockCardsService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<CardsController>(CardsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll()', () => {
    it('happy path — returns serialized list of cards for the current user', async () => {
      mockCardsService.findManyByUserId.mockResolvedValue([
        mockCardWithAnkiDroidExport,
      ]);

      const result = await controller.findAll(mockUser, {});

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 'card-id-1',
        deckId: 'deck-id-1',
        userId: 'user-id-1',
        definitionId: 'def-id-1',
        ankiDroidExport: null,
      });
      expect(mockCardsService.findManyByUserId).toHaveBeenCalledWith(
        'user-id-1',
        {
          deckId: undefined,
          ankiDroidExportStatus: undefined,
          failureReason: undefined,
        },
      );
    });

    it('passes deckId filter to service', async () => {
      mockCardsService.findManyByUserId.mockResolvedValue([]);

      await controller.findAll(mockUser, { deckId: 'deck-id-1' });

      expect(mockCardsService.findManyByUserId).toHaveBeenCalledWith(
        'user-id-1',
        expect.objectContaining({ deckId: 'deck-id-1' }),
      );
    });

    it('passes ankiDroidExportStatus filter to service', async () => {
      mockCardsService.findManyByUserId.mockResolvedValue([]);

      await controller.findAll(mockUser, { ankiDroidExportStatus: 'none' });

      expect(mockCardsService.findManyByUserId).toHaveBeenCalledWith(
        'user-id-1',
        expect.objectContaining({ ankiDroidExportStatus: 'none' }),
      );
    });

    it('passes failureReason filter to service', async () => {
      mockCardsService.findManyByUserId.mockResolvedValue([]);

      await controller.findAll(mockUser, { failureReason: 'DECK_NOT_FOUND' });

      expect(mockCardsService.findManyByUserId).toHaveBeenCalledWith(
        'user-id-1',
        expect.objectContaining({ failureReason: 'DECK_NOT_FOUND' }),
      );
    });

    it('serializes ankiDroidExport summary when export exists on card', async () => {
      mockCardsService.findManyByUserId.mockResolvedValue([mockCardWithExport]);

      const result = await controller.findAll(mockUser, {});

      expect(result[0].ankiDroidExport).toMatchObject({
        id: 'export-id-1',
        status: 'pending',
        failureReason: null,
        lastAttemptedAt: null,
        completedAt: null,
      });
    });

    it('returns empty array when user has no cards', async () => {
      mockCardsService.findManyByUserId.mockResolvedValue([]);

      const result = await controller.findAll(mockUser, {});

      expect(result).toEqual([]);
    });
  });

  describe('findOne()', () => {
    it('happy path — returns serialized card when found', async () => {
      mockCardsService.findOneByIdAndUserId.mockResolvedValue(
        mockCardWithAnkiDroidExport,
      );

      const result = await controller.findOne('card-id-1', mockUser);

      expect(result).toMatchObject({
        id: 'card-id-1',
        deckId: 'deck-id-1',
        userId: 'user-id-1',
      });
      expect(mockCardsService.findOneByIdAndUserId).toHaveBeenCalledWith(
        'card-id-1',
        'user-id-1',
      );
    });

    it('edge case — card not found or not owned throws 404 NotFoundException', async () => {
      mockCardsService.findOneByIdAndUserId.mockResolvedValue(null);

      await expect(
        controller.findOne('card-id-1', mockUser),
      ).rejects.toBeInstanceOf(NotFoundException);

      const err = await controller
        .findOne('card-id-1', mockUser)
        .catch((e: unknown) => e);
      expect((err as NotFoundException).getResponse()).toMatchObject({
        message: 'CARD_NOT_FOUND',
      });
    });

    it('includes ankiDroidExport in serialized response', async () => {
      mockCardsService.findOneByIdAndUserId.mockResolvedValue(
        mockCardWithExport,
      );

      const result = await controller.findOne('card-id-1', mockUser);

      expect(result.ankiDroidExport).toMatchObject({
        id: 'export-id-1',
        status: 'pending',
      });
    });

    it('serializes inflectionForms from definition when present', async () => {
      const cardWithInflections: CardWithAnkiDroidExport = {
        ...mockCard,
        definition: { ...mockDefinitionWithInflections, word: mockWord },
        ankidroidExport: null,
      };
      mockCardsService.findOneByIdAndUserId.mockResolvedValue(
        cardWithInflections,
      );

      const result = await controller.findOne('card-id-1', mockUser);

      expect(result.definition.inflectionForms).toEqual({
        type: 'verb',
        base: 'run',
        past: 'ran',
        pastParticiple: 'run',
        gerundParticiple: 'running',
        present3sg: 'runs',
        presentNon3sg: 'run',
      });
    });

    it('serializes inflectionForms as null when definition has none', async () => {
      mockCardsService.findOneByIdAndUserId.mockResolvedValue(
        mockCardWithAnkiDroidExport,
      );

      const result = await controller.findOne('card-id-1', mockUser);

      expect(result.definition.inflectionForms).toBeNull();
    });
  });

  describe('create()', () => {
    it('happy path — creates and returns serialized card', async () => {
      mockCardsService.create.mockResolvedValue(mockCardWithDefinitionAndWord);

      const result = await controller.create(mockUser, {
        deckId: 'deck-id-1',
        definitionId: 'def-id-1',
      });

      expect(result).toMatchObject({
        id: 'card-id-1',
        deckId: 'deck-id-1',
        definitionId: 'def-id-1',
      });
    });

    it('edge case — DeckOwnershipError maps to 404 NotFoundException with DECK_NOT_FOUND', async () => {
      mockCardsService.create.mockRejectedValue(new DeckOwnershipError());

      const err = await controller
        .create(mockUser, { deckId: 'deck-id-1', definitionId: 'def-id-1' })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(NotFoundException);
      expect((err as NotFoundException).getResponse()).toMatchObject({
        message: 'DECK_NOT_FOUND',
      });
    });

    it('edge case — CardAlreadyExistsError maps to 409 ConflictException', async () => {
      mockCardsService.create.mockRejectedValue(new CardAlreadyExistsError());

      const err = await controller
        .create(mockUser, { deckId: 'deck-id-1', definitionId: 'def-id-1' })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(ConflictException);
      expect((err as ConflictException).getResponse()).toMatchObject({
        message: 'CARD_ALREADY_EXISTS',
      });
    });

    it('edge case — DefinitionNotFoundError maps to 404 NotFoundException with DEFINITION_NOT_FOUND', async () => {
      mockCardsService.create.mockRejectedValue(new DefinitionNotFoundError());

      const err = await controller
        .create(mockUser, { deckId: 'deck-id-1', definitionId: 'def-id-1' })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(NotFoundException);
      expect((err as NotFoundException).getResponse()).toMatchObject({
        message: 'DEFINITION_NOT_FOUND',
      });
    });

    it('edge case — unknown error is re-thrown', async () => {
      mockCardsService.create.mockRejectedValue(
        new Error('Unexpected failure'),
      );

      await expect(
        controller.create(mockUser, {
          deckId: 'deck-id-1',
          definitionId: 'def-id-1',
        }),
      ).rejects.toThrow('Unexpected failure');
    });
  });
});
