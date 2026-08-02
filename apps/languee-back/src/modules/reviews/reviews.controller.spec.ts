import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CardNotFoundError } from '../cards/cards.errors';
import { DeckNotFoundError } from '../decks/decks.errors';
import { UnsupportedCardTypeError } from './reviews.errors';
import type { CurrentUserPayload } from '../auth/decorators/current-user.decorator';

const mockUser: CurrentUserPayload = {
  userId: 'user-id-1',
  sessionId: 'session-id-1',
};

const mockReviewsService = {
  getSummary: jest.fn(),
  getQueue: jest.fn(),
  checkTypedAnswer: jest.fn(),
  checkForms: jest.fn(),
  gradeCard: jest.fn(),
};

describe('ReviewsController', () => {
  let controller: ReviewsController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReviewsController],
      providers: [{ provide: ReviewsService, useValue: mockReviewsService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ReviewsController>(ReviewsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('summary()', () => {
    it('happy path — returns counts from the service', async () => {
      mockReviewsService.getSummary.mockResolvedValue({
        dueCount: 5,
        newCount: 3,
      });

      const result = await controller.summary(mockUser);

      expect(result).toEqual({ dueCount: 5, newCount: 3 });
      expect(mockReviewsService.getSummary).toHaveBeenCalledWith('user-id-1');
    });
  });

  describe('queue()', () => {
    it('happy path — defaults limit to 20 when not provided', async () => {
      mockReviewsService.getQueue.mockResolvedValue([]);

      await controller.queue({}, mockUser);

      expect(mockReviewsService.getQueue).toHaveBeenCalledWith('user-id-1', {
        deckId: undefined,
        limit: 20,
      });
    });

    it('caps limit at 100 even when a larger value is requested', async () => {
      mockReviewsService.getQueue.mockResolvedValue([]);

      await controller.queue({ limit: '500' }, mockUser);

      expect(mockReviewsService.getQueue).toHaveBeenCalledWith('user-id-1', {
        deckId: undefined,
        limit: 100,
      });
    });

    it('passes deckId through to the service', async () => {
      mockReviewsService.getQueue.mockResolvedValue([]);

      await controller.queue({ deckId: 'deck-id-1' }, mockUser);

      expect(mockReviewsService.getQueue).toHaveBeenCalledWith('user-id-1', {
        deckId: 'deck-id-1',
        limit: 20,
      });
    });

    it('serializes queue items returned by the service, one payload per type', async () => {
      mockReviewsService.getQueue.mockResolvedValue([
        {
          cardId: 'card-id-1',
          type: 'existing',
          decks: [{ id: 'deck-id-1', name: 'English basics' }],
          isNew: false,
          existing: {
            definition: 'To encounter unexpectedly.',
            maskedSentence: 'Guess who I ____ at the station!',
            partOfSpeech: 'verb',
            kind: 'phrasal_verb',
            lemmaLength: 8,
            language: 'en',
          },
          inflection: null,
          definition: null,
        },
      ]);

      const result = await controller.queue({}, mockUser);

      expect(result.items[0]).toEqual({
        cardId: 'card-id-1',
        type: 'existing',
        decks: [{ id: 'deck-id-1', name: 'English basics' }],
        isNew: false,
        existing: {
          definition: 'To encounter unexpectedly.',
          maskedSentence: 'Guess who I ____ at the station!',
          partOfSpeech: 'verb',
          kind: 'phrasal_verb',
          lemmaLength: 8,
          language: 'en',
        },
        inflection: null,
        definition: null,
      });
    });

    it('edge case — DeckNotFoundError maps to 404 NotFoundException with DECK_NOT_FOUND', async () => {
      mockReviewsService.getQueue.mockRejectedValue(new DeckNotFoundError());

      const err = await controller
        .queue({ deckId: 'deck-id-other' }, mockUser)
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(NotFoundException);
      expect((err as NotFoundException).getResponse()).toMatchObject({
        message: 'DECK_NOT_FOUND',
      });
    });

    it('edge case — unknown error is re-thrown', async () => {
      mockReviewsService.getQueue.mockRejectedValue(
        new Error('Unexpected failure'),
      );

      await expect(controller.queue({}, mockUser)).rejects.toThrow(
        'Unexpected failure',
      );
    });
  });

  describe('answer()', () => {
    it('happy path — returns the serialized answer outcome', async () => {
      mockReviewsService.checkTypedAnswer.mockResolvedValue({
        result: 'correct',
        matchedForm: 'run into',
        revealed: {
          lemma: 'run into',
          ipa: null,
          inflectionForms: { type: 'verb', base: 'run into' },
        },
      });

      const result = await controller.answer(
        'card-id-1',
        { typedAnswer: 'run into' },
        mockUser,
      );

      expect(result).toEqual({
        result: 'correct',
        matchedForm: 'run into',
        revealed: {
          lemma: 'run into',
          ipa: null,
          inflectionForms: { type: 'verb', base: 'run into' },
        },
      });
      expect(mockReviewsService.checkTypedAnswer).toHaveBeenCalledWith(
        'user-id-1',
        'card-id-1',
        'run into',
      );
    });

    it('edge case — CardNotFoundError maps to 404 NotFoundException with CARD_NOT_FOUND', async () => {
      mockReviewsService.checkTypedAnswer.mockRejectedValue(
        new CardNotFoundError(),
      );

      const err = await controller
        .answer('card-id-1', { typedAnswer: 'run into' }, mockUser)
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(NotFoundException);
      expect((err as NotFoundException).getResponse()).toMatchObject({
        message: 'CARD_NOT_FOUND',
      });
    });

    it('edge case — UnsupportedCardTypeError maps to 400 BadRequestException', async () => {
      mockReviewsService.checkTypedAnswer.mockRejectedValue(
        new UnsupportedCardTypeError('Only `existing` cards support this'),
      );

      const err = await controller
        .answer('card-id-2', { typedAnswer: 'run' }, mockUser)
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(BadRequestException);
    });

    it('edge case — unknown error is re-thrown', async () => {
      mockReviewsService.checkTypedAnswer.mockRejectedValue(
        new Error('Unexpected failure'),
      );

      await expect(
        controller.answer('card-id-1', { typedAnswer: 'run into' }, mockUser),
      ).rejects.toThrow('Unexpected failure');
    });
  });

  describe('checkForms()', () => {
    it('happy path — returns per-form feedback', async () => {
      mockReviewsService.checkForms.mockResolvedValue({
        results: {
          base: { typed: 'run', expected: 'run', correct: true },
          past: { typed: 'runned', expected: 'ran', correct: false },
        },
        allCorrect: false,
        revealed: { lemma: 'run', ipa: null, inflectionForms: { base: 'run' } },
      });

      const result = await controller.checkForms(
        'card-id-2',
        { typedForms: { base: 'run', past: 'runned' } },
        mockUser,
      );

      expect(result.allCorrect).toBe(false);
      expect(mockReviewsService.checkForms).toHaveBeenCalledWith(
        'user-id-1',
        'card-id-2',
        { base: 'run', past: 'runned' },
      );
    });

    it('edge case — CardNotFoundError maps to 404 NotFoundException with CARD_NOT_FOUND', async () => {
      mockReviewsService.checkForms.mockRejectedValue(new CardNotFoundError());

      const err = await controller
        .checkForms('card-id-2', { typedForms: { base: 'run' } }, mockUser)
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(NotFoundException);
      expect((err as NotFoundException).getResponse()).toMatchObject({
        message: 'CARD_NOT_FOUND',
      });
    });

    it('edge case — UnsupportedCardTypeError maps to 400 BadRequestException', async () => {
      mockReviewsService.checkForms.mockRejectedValue(
        new UnsupportedCardTypeError('Only `inflection` cards support this'),
      );

      const err = await controller
        .checkForms('card-id-1', { typedForms: { base: 'run' } }, mockUser)
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(BadRequestException);
    });
  });

  describe('grade()', () => {
    it('happy path — returns the serialized grade outcome', async () => {
      const nextDueAt = new Date('2026-07-03T12:00:00.000Z');
      mockReviewsService.gradeCard.mockResolvedValue({
        nextDueAt,
        intervalDays: 1,
        state: 'review',
      });

      const result = await controller.grade(
        'card-id-1',
        { rating: 'good' },
        mockUser,
      );

      expect(result).toEqual({ nextDueAt, intervalDays: 1, state: 'review' });
      expect(mockReviewsService.gradeCard).toHaveBeenCalledWith(
        'user-id-1',
        'card-id-1',
        {
          rating: 'good',
          typedAnswer: undefined,
          typedForms: undefined,
          answerResult: undefined,
        },
      );
    });

    it('passes optional typedForms through to the service', async () => {
      mockReviewsService.gradeCard.mockResolvedValue({
        nextDueAt: new Date(),
        intervalDays: 1,
        state: 'review',
      });

      await controller.grade(
        'card-id-2',
        { rating: 'easy', typedForms: { base: 'run', past: 'ran' } },
        mockUser,
      );

      expect(mockReviewsService.gradeCard).toHaveBeenCalledWith(
        'user-id-1',
        'card-id-2',
        expect.objectContaining({
          rating: 'easy',
          typedForms: { base: 'run', past: 'ran' },
        }),
      );
    });

    it('edge case — CardNotFoundError maps to 404 NotFoundException with CARD_NOT_FOUND', async () => {
      mockReviewsService.gradeCard.mockRejectedValue(new CardNotFoundError());

      const err = await controller
        .grade('card-id-1', { rating: 'good' }, mockUser)
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(NotFoundException);
      expect((err as NotFoundException).getResponse()).toMatchObject({
        message: 'CARD_NOT_FOUND',
      });
    });

    it('edge case — unknown error is re-thrown', async () => {
      mockReviewsService.gradeCard.mockRejectedValue(
        new Error('Unexpected failure'),
      );

      await expect(
        controller.grade('card-id-1', { rating: 'good' }, mockUser),
      ).rejects.toThrow('Unexpected failure');
    });
  });
});
