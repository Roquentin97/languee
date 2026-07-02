import {
  BadGatewayException,
  UnprocessableEntityException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { VocabularyController } from './vocabulary.controller';
import { VocabularyService } from './vocabulary.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { NlpMultiWordError, NlpUnavailableError } from '../nlp/nlp.errors';
import { DefinitionsNotFoundException } from '../dictionary/dictionary.errors';
import { ProviderUnavailableError } from '../definitions/definitions.errors';
import type { CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import type { LookupVocabularyOutput } from './types/lookup-vocabulary.types';
import { PartOfSpeech } from './enums/part-of-speech.enum';

const mockVocabularyService = {
  lookup: jest.fn(),
};

const mockUser: CurrentUserPayload = {
  userId: 'user-id-1',
  sessionId: 'session-id-1',
};

const successOutput: LookupVocabularyOutput = {
  input: 'run',
  lemma: 'run',
  kind: 'word',
  partOfSpeech: PartOfSpeech.VERB,
  definitions: [
    {
      id: 'def-id-1',
      partOfSpeech: PartOfSpeech.VERB,
      definition: 'to move fast',
      example: 'She ran quickly.',
      provider: 'free-dictionary',
      hasIrregularForms: true,
      inflectionForms: { type: 'verb' as const, base: 'run', past: 'ran' },
      decks: [],
    },
  ],
  meta: {
    filteredByPos: true,
    unmatchedPos: false,
    availablePartsOfSpeech: [PartOfSpeech.VERB],
    isExpression: false,
    providerMiss: false,
    expressionContextFound: null,
  },
};

describe('VocabularyController', () => {
  let controller: VocabularyController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [VocabularyController],
      providers: [
        { provide: VocabularyService, useValue: mockVocabularyService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<VocabularyController>(VocabularyController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('lookup()', () => {
    it('happy path — returns vocabulary service output', async () => {
      mockVocabularyService.lookup.mockResolvedValue(successOutput);

      const result = await controller.lookup(
        { word: 'run', language: 'en' },
        mockUser,
      );

      expect(result).toEqual(successOutput);
      expect(mockVocabularyService.lookup).toHaveBeenCalledWith({
        word: 'run',
        language: 'en',
        userId: 'user-id-1',
        context: undefined,
        disablePosFiltering: false,
      });
    });

    it('language defaults to "en" when not provided in query', async () => {
      mockVocabularyService.lookup.mockResolvedValue(successOutput);

      await controller.lookup({ word: 'run' }, mockUser);

      expect(mockVocabularyService.lookup).toHaveBeenCalledWith(
        expect.objectContaining({ language: 'en' }),
      );
    });

    it('passes disablePosFiltering=true through as a boolean flag', async () => {
      mockVocabularyService.lookup.mockResolvedValue(successOutput);

      await controller.lookup(
        {
          word: 'run',
          language: 'en',
          context: 'She runs every morning.',
          disablePosFiltering: 'true',
        },
        mockUser,
      );

      expect(mockVocabularyService.lookup).toHaveBeenCalledWith(
        expect.objectContaining({
          context: 'She runs every morning.',
          disablePosFiltering: true,
        }),
      );
    });

    it('NlpUnavailableError is mapped to 502 BadGatewayException with NLP_UNAVAILABLE message', async () => {
      mockVocabularyService.lookup.mockRejectedValue(new NlpUnavailableError());

      await expect(
        controller.lookup({ word: 'walk', language: 'en' }, mockUser),
      ).rejects.toBeInstanceOf(BadGatewayException);

      const err = await controller
        .lookup({ word: 'walk', language: 'en' }, mockUser)
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(BadGatewayException);
      expect((err as BadGatewayException).getResponse()).toMatchObject({
        message: 'NLP_UNAVAILABLE',
      });
    });

    it('NlpMultiWordError is mapped to 422 UnprocessableEntityException with MULTI_WORD_INPUT_NOT_SUPPORTED message', async () => {
      mockVocabularyService.lookup.mockRejectedValue(new NlpMultiWordError());

      const err = await controller
        .lookup({ word: 'walk fast', language: 'en' }, mockUser)
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(UnprocessableEntityException);
      expect((err as UnprocessableEntityException).getResponse()).toMatchObject(
        {
          message: 'MULTI_WORD_INPUT_NOT_SUPPORTED',
        },
      );
    });

    it('DefinitionsNotFoundException is mapped to 404 NotFoundException with DEFINITIONS_NOT_FOUND message', async () => {
      mockVocabularyService.lookup.mockRejectedValue(
        new DefinitionsNotFoundException('xyzabc', 'en'),
      );

      const err = await controller
        .lookup({ word: 'xyzabc', language: 'en' }, mockUser)
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(NotFoundException);
      expect((err as NotFoundException).getResponse()).toMatchObject({
        message: 'DEFINITIONS_NOT_FOUND',
      });
    });

    it('ProviderUnavailableError is mapped to 502 BadGatewayException with PROVIDER_UNAVAILABLE message', async () => {
      mockVocabularyService.lookup.mockRejectedValue(
        new ProviderUnavailableError('free-dictionary'),
      );

      const err = await controller
        .lookup({ word: 'walk', language: 'en' }, mockUser)
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(BadGatewayException);
      expect((err as BadGatewayException).getResponse()).toMatchObject({
        message: 'PROVIDER_UNAVAILABLE',
      });
    });

    it('unknown errors are re-thrown as-is', async () => {
      const unknownErr = new Error('Unexpected failure');
      mockVocabularyService.lookup.mockRejectedValue(unknownErr);

      await expect(
        controller.lookup({ word: 'walk', language: 'en' }, mockUser),
      ).rejects.toThrow('Unexpected failure');
    });
  });
});
