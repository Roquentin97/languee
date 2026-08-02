import { NotFoundException, ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CardsController } from './cards.controller';
import { CardsService } from './cards.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DeckNotFoundError } from '../decks/decks.errors';
import {
  CardAlreadyExistsError,
  DefinitionNotFoundError,
} from './cards.errors';
import type { CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import type {
  CardWithAnkiDroidExport,
  CardWithRelations,
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

function baseCard(overrides: Partial<Card>): Card {
  return {
    id: 'card-id-1',
    type: 'cloze',
    userId: 'user-id-1',
    definitionId: 'def-id-1',
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

const mockCard = baseCard({});

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

const mockCardWithRelations: CardWithRelations = {
  ...mockCard,
  definition: { ...mockDefinition, word: mockWord },
  word: null,
  decks: [{ id: 'deck-id-1', name: 'My Deck' }],
};

const mockCardWithAnkiDroidExport: CardWithAnkiDroidExport = {
  ...mockCardWithRelations,
  ankidroidExport: null,
};

const mockCardWithExport: CardWithAnkiDroidExport = {
  ...mockCardWithRelations,
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
        type: 'cloze',
        userId: 'user-id-1',
        definitionId: 'def-id-1',
        decks: [{ id: 'deck-id-1', name: 'My Deck' }],
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

    it('serializes ankiDroidExport summary when export exists on card', async () => {
      mockCardsService.findManyByUserId.mockResolvedValue([mockCardWithExport]);

      const result = await controller.findAll(mockUser, {});

      expect(result[0].ankiDroidExport).toMatchObject({
        id: 'export-id-1',
        status: 'pending',
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
        type: 'cloze',
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

    it('serializes inflectionForms from definition when present', async () => {
      const cardWithInflections: CardWithAnkiDroidExport = {
        ...mockCardWithRelations,
        definition: { ...mockDefinitionWithInflections, word: mockWord },
        ankidroidExport: null,
      };
      mockCardsService.findOneByIdAndUserId.mockResolvedValue(
        cardWithInflections,
      );

      const result = await controller.findOne('card-id-1', mockUser);

      expect(result.definition?.inflectionForms).toEqual({
        type: 'verb',
        base: 'run',
        past: 'ran',
        pastParticiple: 'run',
        gerundParticiple: 'running',
        present3sg: 'runs',
        presentNon3sg: 'run',
      });
    });

    it('serializes definition as null for an inflection card', async () => {
      const inflectionCard: CardWithAnkiDroidExport = {
        ...baseCard({
          type: 'inflection',
          definitionId: null,
          wordId: 'word-id-1',
          partOfSpeech: 'verb',
        }),
        definition: null,
        word: mockWord,
        decks: [{ id: 'deck-id-1', name: 'My Deck' }],
        ankidroidExport: null,
      };
      mockCardsService.findOneByIdAndUserId.mockResolvedValue(inflectionCard);

      const result = await controller.findOne('card-id-1', mockUser);

      expect(result.definition).toBeNull();
      expect(result.word).toEqual({
        id: 'word-id-1',
        lemma: 'run',
        language: 'en',
      });
    });
  });

  describe('create()', () => {
    it('happy path — creates and returns every generated card', async () => {
      mockCardsService.create.mockResolvedValue([mockCardWithRelations]);

      const result = await controller.create(mockUser, {
        deckId: 'deck-id-1',
        definitionId: 'def-id-1',
      });

      expect(result.cards).toHaveLength(1);
      expect(result.cards[0]).toMatchObject({
        id: 'card-id-1',
        type: 'cloze',
        definitionId: 'def-id-1',
      });
    });

    it('edge case — DeckNotFoundError maps to 404 NotFoundException with DECK_NOT_FOUND', async () => {
      mockCardsService.create.mockRejectedValue(new DeckNotFoundError());

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
