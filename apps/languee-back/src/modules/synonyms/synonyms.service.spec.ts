import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import type { MeaningLink } from '@prisma/client';
import { PrismaService } from '../core/prisma/prisma.service';
import { CardsService } from '../cards/cards.service';
import { DefinitionService } from '../definitions/definitions.service';
import type { DefinitionSummary } from '../definitions/definitions.service';
import { SynonymsService } from './synonyms.service';
import {
  DefinitionNotFoundError,
  MeaningLinkAlreadyExistsError,
  MeaningLinkNotFoundError,
  SelfLinkError,
} from './synonyms.errors';

const DEF_LOW: DefinitionSummary = {
  id: '1db3f769-e154-44c6-9b98-87de1037a395',
  partOfSpeech: 'verb',
  definition: 'to move at a speed faster than walking',
  word: { lemma: 'run', kind: 'word' },
};

const DEF_HIGH: DefinitionSummary = {
  id: 'a2e4529c-cfb7-4f4f-bdb2-0c15e590bf55',
  partOfSpeech: 'verb',
  definition: 'to move quickly on foot',
  word: { lemma: 'sprint', kind: 'word' },
};

const mockLink: MeaningLink = {
  id: 'link-id-1',
  definitionAId: DEF_LOW.id,
  definitionBId: DEF_HIGH.id,
  relationType: 'synonym',
  source: 'user',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
};

const mockPrismaService = {
  meaningLink: {
    create: jest.fn(),
    findMany: jest.fn(),
    delete: jest.fn(),
  },
};

const mockCardsService = {
  findCardsByDefinitionIdsAndUserId: jest.fn(),
};

const mockDefinitionService = {
  findManyByIds: jest.fn(),
};

describe('SynonymsService', () => {
  let service: SynonymsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SynonymsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: CardsService, useValue: mockCardsService },
        { provide: DefinitionService, useValue: mockDefinitionService },
      ],
    }).compile();

    service = module.get<SynonymsService>(SynonymsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createLink()', () => {
    it('happy path — creates a link and returns it with both definitions', async () => {
      mockDefinitionService.findManyByIds.mockResolvedValue([
        DEF_LOW,
        DEF_HIGH,
      ]);
      mockPrismaService.meaningLink.create.mockResolvedValue(mockLink);

      const result = await service.createLink({
        definitionAId: DEF_LOW.id,
        definitionBId: DEF_HIGH.id,
        relationType: 'synonym',
      });

      expect(result).toEqual({
        ...mockLink,
        definitionA: DEF_LOW,
        definitionB: DEF_HIGH,
      });
      expect(mockPrismaService.meaningLink.create).toHaveBeenCalledWith({
        data: {
          definitionAId: DEF_LOW.id,
          definitionBId: DEF_HIGH.id,
          relationType: 'synonym',
          source: 'user',
        },
      });
    });

    it('edge case — swaps ids so the lexicographically smaller id is definitionA', async () => {
      mockDefinitionService.findManyByIds.mockResolvedValue([
        DEF_LOW,
        DEF_HIGH,
      ]);
      mockPrismaService.meaningLink.create.mockResolvedValue(mockLink);

      // Pass ids in reverse order (B before A)
      await service.createLink({
        definitionAId: DEF_HIGH.id,
        definitionBId: DEF_LOW.id,
        relationType: 'synonym',
      });

      expect(mockPrismaService.meaningLink.create).toHaveBeenCalledWith({
        data: {
          definitionAId: DEF_LOW.id,
          definitionBId: DEF_HIGH.id,
          relationType: 'synonym',
          source: 'user',
        },
      });
    });

    it('honors an explicit source when provided', async () => {
      mockDefinitionService.findManyByIds.mockResolvedValue([
        DEF_LOW,
        DEF_HIGH,
      ]);
      mockPrismaService.meaningLink.create.mockResolvedValue({
        ...mockLink,
        source: 'provider',
      });

      await service.createLink({
        definitionAId: DEF_LOW.id,
        definitionBId: DEF_HIGH.id,
        relationType: 'synonym',
        source: 'provider',
      });

      expect(mockPrismaService.meaningLink.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ source: 'provider' }) as unknown,
        }),
      );
    });

    it('edge case — equal ids throw SelfLinkError without querying definitions', async () => {
      await expect(
        service.createLink({
          definitionAId: DEF_LOW.id,
          definitionBId: DEF_LOW.id,
          relationType: 'synonym',
        }),
      ).rejects.toBeInstanceOf(SelfLinkError);

      expect(mockDefinitionService.findManyByIds).not.toHaveBeenCalled();
      expect(mockPrismaService.meaningLink.create).not.toHaveBeenCalled();
    });

    it('edge case — missing definition throws DefinitionNotFoundError naming the missing id', async () => {
      mockDefinitionService.findManyByIds.mockResolvedValue([DEF_LOW]);

      const err = await service
        .createLink({
          definitionAId: DEF_LOW.id,
          definitionBId: DEF_HIGH.id,
          relationType: 'synonym',
        })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(DefinitionNotFoundError);
      expect((err as DefinitionNotFoundError).missingIds).toEqual([
        DEF_HIGH.id,
      ]);
      expect(mockPrismaService.meaningLink.create).not.toHaveBeenCalled();
    });

    it('edge case — duplicate pair throws MeaningLinkAlreadyExistsError on P2002', async () => {
      mockDefinitionService.findManyByIds.mockResolvedValue([
        DEF_LOW,
        DEF_HIGH,
      ]);
      const prismaError = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        { code: 'P2002', clientVersion: '7.0.0' },
      );
      mockPrismaService.meaningLink.create.mockRejectedValue(prismaError);

      await expect(
        service.createLink({
          definitionAId: DEF_LOW.id,
          definitionBId: DEF_HIGH.id,
          relationType: 'synonym',
        }),
      ).rejects.toBeInstanceOf(MeaningLinkAlreadyExistsError);
    });

    it('edge case — unexpected prisma error is re-thrown', async () => {
      mockDefinitionService.findManyByIds.mockResolvedValue([
        DEF_LOW,
        DEF_HIGH,
      ]);
      mockPrismaService.meaningLink.create.mockRejectedValue(
        new Error('Network failure'),
      );

      await expect(
        service.createLink({
          definitionAId: DEF_LOW.id,
          definitionBId: DEF_HIGH.id,
          relationType: 'synonym',
        }),
      ).rejects.toThrow('Network failure');
    });
  });

  describe('listLinksForDefinition()', () => {
    it('happy path — presents the counterpart definition as "linked" regardless of side', async () => {
      mockPrismaService.meaningLink.findMany.mockResolvedValue([
        { ...mockLink, definitionA: DEF_LOW, definitionB: DEF_HIGH },
      ]);

      const resultForA = await service.listLinksForDefinition(DEF_LOW.id);
      expect(resultForA).toEqual([
        {
          id: mockLink.id,
          relationType: 'synonym',
          source: 'user',
          createdAt: mockLink.createdAt,
          linked: {
            definitionId: DEF_HIGH.id,
            definition: DEF_HIGH.definition,
            partOfSpeech: DEF_HIGH.partOfSpeech,
            lemma: DEF_HIGH.word.lemma,
            kind: DEF_HIGH.word.kind,
          },
        },
      ]);

      const resultForB = await service.listLinksForDefinition(DEF_HIGH.id);
      expect(resultForB[0]?.linked.definitionId).toBe(DEF_LOW.id);
    });

    it('edge case — no links returns an empty array', async () => {
      mockPrismaService.meaningLink.findMany.mockResolvedValue([]);

      const result = await service.listLinksForDefinition(DEF_LOW.id);

      expect(result).toEqual([]);
    });
  });

  describe('deleteLink()', () => {
    it('happy path — deletes the link', async () => {
      mockPrismaService.meaningLink.delete.mockResolvedValue(mockLink);

      await expect(service.deleteLink('link-id-1')).resolves.toBeUndefined();
      expect(mockPrismaService.meaningLink.delete).toHaveBeenCalledWith({
        where: { id: 'link-id-1' },
      });
    });

    it('edge case — missing link throws MeaningLinkNotFoundError on P2025', async () => {
      const prismaError = new Prisma.PrismaClientKnownRequestError(
        'Record not found',
        { code: 'P2025', clientVersion: '7.0.0' },
      );
      mockPrismaService.meaningLink.delete.mockRejectedValue(prismaError);

      await expect(
        service.deleteLink('nonexistent-link'),
      ).rejects.toBeInstanceOf(MeaningLinkNotFoundError);
    });

    it('edge case — unexpected prisma error is re-thrown', async () => {
      mockPrismaService.meaningLink.delete.mockRejectedValue(
        new Error('Network failure'),
      );

      await expect(service.deleteLink('link-id-1')).rejects.toThrow(
        'Network failure',
      );
    });
  });

  describe('findSynonymAnswersForDefinition()', () => {
    it('happy path — returns the counterpart lemma/kind for both relation types', async () => {
      mockPrismaService.meaningLink.findMany.mockResolvedValue([
        {
          ...mockLink,
          relationType: 'synonym',
          definitionA: DEF_LOW,
          definitionB: DEF_HIGH,
        },
        {
          ...mockLink,
          id: 'link-id-2',
          relationType: 'related',
          definitionA: DEF_LOW,
          definitionB: DEF_HIGH,
        },
      ]);

      const result = await service.findSynonymAnswersForDefinition(DEF_LOW.id);

      expect(result).toEqual([
        {
          definitionId: DEF_HIGH.id,
          lemma: DEF_HIGH.word.lemma,
          kind: DEF_HIGH.word.kind,
          relationType: 'synonym',
        },
        {
          definitionId: DEF_HIGH.id,
          lemma: DEF_HIGH.word.lemma,
          kind: DEF_HIGH.word.kind,
          relationType: 'related',
        },
      ]);
    });

    it('edge case — no links returns an empty array', async () => {
      mockPrismaService.meaningLink.findMany.mockResolvedValue([]);

      const result = await service.findSynonymAnswersForDefinition(DEF_LOW.id);

      expect(result).toEqual([]);
    });
  });

  describe('findOverlapsForUser()', () => {
    it('happy path — aggregates multiple cards on the same linked definition into one entry with all decks', async () => {
      mockPrismaService.meaningLink.findMany.mockResolvedValue([
        {
          relationType: 'synonym',
          definitionAId: DEF_LOW.id,
          definitionBId: DEF_HIGH.id,
          definitionA: { id: DEF_LOW.id, word: { lemma: DEF_LOW.word.lemma } },
          definitionB: {
            id: DEF_HIGH.id,
            word: { lemma: DEF_HIGH.word.lemma },
          },
        },
      ]);
      mockCardsService.findCardsByDefinitionIdsAndUserId.mockResolvedValue([
        { definitionId: DEF_HIGH.id, deck: { id: 'deck-1', name: 'Deck A' } },
        { definitionId: DEF_HIGH.id, deck: { id: 'deck-2', name: 'Deck B' } },
      ]);

      const result = await service.findOverlapsForUser('user-id-1', [
        DEF_LOW.id,
      ]);

      expect(result).toEqual([
        {
          definitionId: DEF_LOW.id,
          linkedDefinitionId: DEF_HIGH.id,
          linkedLemma: DEF_HIGH.word.lemma,
          relationType: 'synonym',
          decks: [
            { id: 'deck-1', name: 'Deck A' },
            { id: 'deck-2', name: 'Deck B' },
          ],
        },
      ]);
      expect(
        mockCardsService.findCardsByDefinitionIdsAndUserId,
      ).toHaveBeenCalledWith([DEF_HIGH.id], 'user-id-1');
    });

    it('edge case — no links returns empty array without querying cards', async () => {
      mockPrismaService.meaningLink.findMany.mockResolvedValue([]);

      const result = await service.findOverlapsForUser('user-id-1', [
        DEF_LOW.id,
      ]);

      expect(result).toEqual([]);
      expect(
        mockCardsService.findCardsByDefinitionIdsAndUserId,
      ).not.toHaveBeenCalled();
    });

    it('edge case — linked definition exists but user has no cards for it excludes the entry', async () => {
      mockPrismaService.meaningLink.findMany.mockResolvedValue([
        {
          relationType: 'synonym',
          definitionAId: DEF_LOW.id,
          definitionBId: DEF_HIGH.id,
          definitionA: { id: DEF_LOW.id, word: { lemma: DEF_LOW.word.lemma } },
          definitionB: {
            id: DEF_HIGH.id,
            word: { lemma: DEF_HIGH.word.lemma },
          },
        },
      ]);
      mockCardsService.findCardsByDefinitionIdsAndUserId.mockResolvedValue([]);

      const result = await service.findOverlapsForUser('user-id-1', [
        DEF_LOW.id,
      ]);

      expect(result).toEqual([]);
    });

    it('de-duplicates repeated input definition ids before querying', async () => {
      mockPrismaService.meaningLink.findMany.mockResolvedValue([]);

      await service.findOverlapsForUser('user-id-1', [DEF_LOW.id, DEF_LOW.id]);

      expect(mockPrismaService.meaningLink.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [
              { definitionAId: { in: [DEF_LOW.id] } },
              { definitionBId: { in: [DEF_LOW.id] } },
            ],
          },
        }),
      );
    });
  });
});
