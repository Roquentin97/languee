import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { SynonymsController } from './synonyms.controller';
import { SynonymsService } from './synonyms.service';
import type {
  DefinitionOverlap,
  MeaningLinkListItem,
  MeaningLinkWithDefinitions,
} from './synonyms.service';
import {
  DefinitionNotFoundError,
  MeaningLinkAlreadyExistsError,
  MeaningLinkNotFoundError,
  SelfLinkError,
} from './synonyms.errors';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { CurrentUserPayload } from '../auth/decorators/current-user.decorator';

const mockUser: CurrentUserPayload = {
  userId: 'user-id-1',
  sessionId: 'session-id-1',
};

const DEF_LOW = {
  id: '1db3f769-e154-44c6-9b98-87de1037a395',
  partOfSpeech: 'verb',
  definition: 'to move at a speed faster than walking',
  word: { lemma: 'run', kind: 'word' },
};

const DEF_HIGH = {
  id: 'a2e4529c-cfb7-4f4f-bdb2-0c15e590bf55',
  partOfSpeech: 'verb',
  definition: 'to move quickly on foot',
  word: { lemma: 'sprint', kind: 'word' },
};

function makeUuid(seed: number): string {
  const hex = seed.toString(16).padStart(12, '0');
  return `aaaaaaaa-aaaa-4aaa-8aaa-${hex}`;
}

const mockLinkWithDefinitions: MeaningLinkWithDefinitions = {
  id: 'link-id-1',
  definitionAId: DEF_LOW.id,
  definitionBId: DEF_HIGH.id,
  relationType: 'synonym',
  source: 'user',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  definitionA: DEF_LOW,
  definitionB: DEF_HIGH,
};

const mockSynonymsService = {
  createLink: jest.fn(),
  listLinksForDefinition: jest.fn(),
  deleteLink: jest.fn(),
  findOverlapsForUser: jest.fn(),
};

describe('SynonymsController', () => {
  let controller: SynonymsController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SynonymsController],
      providers: [{ provide: SynonymsService, useValue: mockSynonymsService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<SynonymsController>(SynonymsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create()', () => {
    const dto = {
      definitionAId: DEF_LOW.id,
      definitionBId: DEF_HIGH.id,
      relationType: 'synonym' as const,
    };

    it('happy path — creates and returns serialized link', async () => {
      mockSynonymsService.createLink.mockResolvedValue(mockLinkWithDefinitions);

      const result = await controller.create(dto);

      expect(result).toMatchObject({
        id: 'link-id-1',
        relationType: 'synonym',
        source: 'user',
      });
      expect(result.definitionA.lemma).toBe('run');
      expect(result.definitionB.lemma).toBe('sprint');
    });

    it('edge case — SelfLinkError maps to 400 BadRequestException', async () => {
      mockSynonymsService.createLink.mockRejectedValue(new SelfLinkError());

      const err = await controller.create(dto).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(BadRequestException);
      expect((err as BadRequestException).getResponse()).toMatchObject({
        message: 'SELF_LINK_NOT_ALLOWED',
      });
    });

    it('edge case — DefinitionNotFoundError maps to 404 NotFoundException', async () => {
      mockSynonymsService.createLink.mockRejectedValue(
        new DefinitionNotFoundError([DEF_HIGH.id]),
      );

      const err = await controller.create(dto).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(NotFoundException);
      expect((err as NotFoundException).getResponse()).toMatchObject({
        message: 'DEFINITION_NOT_FOUND',
      });
    });

    it('edge case — MeaningLinkAlreadyExistsError maps to 409 ConflictException', async () => {
      mockSynonymsService.createLink.mockRejectedValue(
        new MeaningLinkAlreadyExistsError(),
      );

      const err = await controller.create(dto).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(ConflictException);
      expect((err as ConflictException).getResponse()).toMatchObject({
        message: 'MEANING_LINK_ALREADY_EXISTS',
      });
    });

    it('edge case — unexpected error is re-thrown', async () => {
      mockSynonymsService.createLink.mockRejectedValue(
        new Error('Unexpected failure'),
      );

      await expect(controller.create(dto)).rejects.toThrow(
        'Unexpected failure',
      );
    });
  });

  describe('listForDefinition()', () => {
    it('happy path — returns links wrapped in a links array', async () => {
      const items: MeaningLinkListItem[] = [
        {
          id: 'link-id-1',
          relationType: 'synonym',
          source: 'user',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          linked: {
            definitionId: DEF_HIGH.id,
            definition: DEF_HIGH.definition,
            partOfSpeech: DEF_HIGH.partOfSpeech,
            lemma: DEF_HIGH.word.lemma,
            kind: DEF_HIGH.word.kind,
          },
        },
      ];
      mockSynonymsService.listLinksForDefinition.mockResolvedValue(items);

      const result = await controller.listForDefinition(DEF_LOW.id);

      expect(result.links).toHaveLength(1);
      expect(result.links[0]?.linked.definitionId).toBe(DEF_HIGH.id);
    });

    it('edge case — returns empty array when no links exist', async () => {
      mockSynonymsService.listLinksForDefinition.mockResolvedValue([]);

      const result = await controller.listForDefinition(DEF_LOW.id);

      expect(result).toEqual({ links: [] });
    });
  });

  describe('findOverlaps()', () => {
    it('happy path — parses comma-separated ids and returns overlaps', async () => {
      const overlaps: DefinitionOverlap[] = [
        {
          definitionId: DEF_LOW.id,
          linkedDefinitionId: DEF_HIGH.id,
          linkedLemma: DEF_HIGH.word.lemma,
          relationType: 'synonym',
          decks: [{ id: 'deck-1', name: 'My Deck' }],
        },
      ];
      mockSynonymsService.findOverlapsForUser.mockResolvedValue(overlaps);

      const result = await controller.findOverlaps(
        { definitionIds: `${DEF_LOW.id},${DEF_HIGH.id}` },
        mockUser,
      );

      expect(result.overlaps).toHaveLength(1);
      expect(mockSynonymsService.findOverlapsForUser).toHaveBeenCalledWith(
        'user-id-1',
        [DEF_LOW.id, DEF_HIGH.id],
      );
    });

    it('edge case — empty result returns empty overlaps array', async () => {
      mockSynonymsService.findOverlapsForUser.mockResolvedValue([]);

      const result = await controller.findOverlaps(
        { definitionIds: DEF_LOW.id },
        mockUser,
      );

      expect(result).toEqual({ overlaps: [] });
    });

    it('edge case — non-uuid id throws 400 BadRequestException', async () => {
      const err = await controller
        .findOverlaps({ definitionIds: 'not-a-uuid' }, mockUser)
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(BadRequestException);
      expect((err as BadRequestException).getResponse()).toMatchObject({
        message: 'DEFINITION_IDS_INVALID_UUID',
      });
      expect(mockSynonymsService.findOverlapsForUser).not.toHaveBeenCalled();
    });

    it('edge case — more than 50 ids throws 400 BadRequestException', async () => {
      const ids = Array.from({ length: 51 }, (_, i) => makeUuid(i)).join(',');

      const err = await controller
        .findOverlaps({ definitionIds: ids }, mockUser)
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(BadRequestException);
      expect((err as BadRequestException).getResponse()).toMatchObject({
        message: 'DEFINITION_IDS_COUNT_OUT_OF_RANGE',
      });
      expect(mockSynonymsService.findOverlapsForUser).not.toHaveBeenCalled();
    });
  });

  describe('remove()', () => {
    it('happy path — deletes the link', async () => {
      mockSynonymsService.deleteLink.mockResolvedValue(undefined);

      await expect(controller.remove('link-id-1')).resolves.toBeUndefined();
      expect(mockSynonymsService.deleteLink).toHaveBeenCalledWith('link-id-1');
    });

    it('edge case — MeaningLinkNotFoundError maps to 404 NotFoundException', async () => {
      mockSynonymsService.deleteLink.mockRejectedValue(
        new MeaningLinkNotFoundError(),
      );

      const err = await controller
        .remove('nonexistent-link')
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(NotFoundException);
      expect((err as NotFoundException).getResponse()).toMatchObject({
        message: 'MEANING_LINK_NOT_FOUND',
      });
    });

    it('edge case — unexpected error is re-thrown', async () => {
      mockSynonymsService.deleteLink.mockRejectedValue(
        new Error('Unexpected failure'),
      );

      await expect(controller.remove('link-id-1')).rejects.toThrow(
        'Unexpected failure',
      );
    });
  });
});
