import { Injectable, Logger } from '@nestjs/common';
import type { CardReviewState } from '@prisma/client';
import { PrismaService } from '../core/prisma/prisma.service';
import { CardsService } from '../cards/cards.service';
import type { CardWithDefinitionAndWord } from '../cards/cards.service';
import { DecksService } from '../decks/decks.service';
import type { InflectionForms } from '../dictionary/types/inflection-forms.types';
import { CardOwnershipError, DeckOwnershipError } from './reviews.errors';
import { collectTargetForms, maskText } from './lib/masking';
import { checkAnswer } from './lib/answer-matching';
import { scheduleReview } from './lib/sm2';
import type {
  AnswerCheckOutcome,
  GradeInput,
  GradeOutcome,
  ReviewPrompt,
  ReviewQueueItem,
  ReviewSummary,
} from './reviews.types';

const DEFAULT_REVIEW_STATE: Pick<
  CardReviewState,
  'state' | 'intervalDays' | 'easeFactor' | 'repetitions' | 'lapses'
> = {
  state: 'new',
  intervalDays: 0,
  easeFactor: 2.5,
  repetitions: 0,
  lapses: 0,
};

type CardWithDeck = CardWithDefinitionAndWord & {
  deck: { id: string; name: string };
};

@Injectable()
export class ReviewsService {
  private readonly logger = new Logger(ReviewsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cardsService: CardsService,
    private readonly decksService: DecksService,
  ) {}

  async getSummary(userId: string): Promise<ReviewSummary> {
    const now = new Date();
    const [dueCount, newCards] = await Promise.all([
      this.prisma.cardReviewState.count({
        where: { dueAt: { lte: now }, card: { userId } },
      }),
      this.cardsService.findCardsWithoutReviewState(userId),
    ]);

    return { dueCount, newCount: newCards.length };
  }

  async getQueue(
    userId: string,
    options: { deckId?: string; limit: number },
  ): Promise<ReviewQueueItem[]> {
    const { deckId, limit } = options;

    if (deckId !== undefined) {
      const deck = await this.decksService.findOneByIdAndUserId(deckId, userId);
      if (deck === null) throw new DeckOwnershipError();
    }

    const now = new Date();

    const dueStates = await this.prisma.cardReviewState.findMany({
      where: {
        dueAt: { lte: now },
        card: { userId, ...(deckId !== undefined ? { deckId } : {}) },
      },
      include: {
        card: {
          include: {
            definition: { include: { word: true } },
            deck: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { dueAt: 'asc' },
      take: limit,
    });

    const remaining = limit - dueStates.length;
    const newCards =
      remaining > 0
        ? await this.cardsService.findCardsWithoutReviewState(
            userId,
            deckId,
            remaining,
          )
        : [];

    this.logger.debug({
      message: 'review queue assembled',
      event: 'reviews.queue_assembled',
      method: this.getQueue.name,
      data: {
        userId,
        deckId,
        limit,
        dueCount: dueStates.length,
        newCount: newCards.length,
      },
    });

    return [
      ...dueStates.map((s) => this.buildQueueItem(s.card, false)),
      ...newCards.map((c) => this.buildQueueItem(c, true)),
    ];
  }

  async checkTypedAnswer(
    userId: string,
    cardId: string,
    typedAnswer: string,
  ): Promise<AnswerCheckOutcome> {
    const card = await this.cardsService.findOneByIdAndUserId(cardId, userId);
    if (card === null) throw new CardOwnershipError();

    const forms = this.targetFormsForCard(card);
    const outcome = checkAnswer(typedAnswer, forms);

    if (outcome.result === 'correct') {
      return { result: 'correct', matchedForm: outcome.matchedForm };
    }
    return { result: 'incorrect', matchedForm: null };
  }

  async gradeCard(
    userId: string,
    cardId: string,
    input: GradeInput,
  ): Promise<GradeOutcome> {
    const card = await this.cardsService.findOneByIdAndUserId(cardId, userId);
    if (card === null) throw new CardOwnershipError();

    const existingState = await this.prisma.cardReviewState.findUnique({
      where: { cardId },
    });
    const currentState = existingState ?? DEFAULT_REVIEW_STATE;

    const now = new Date();
    const scheduled = scheduleReview({
      state: currentState.state,
      intervalDays: currentState.intervalDays,
      easeFactor: currentState.easeFactor,
      repetitions: currentState.repetitions,
      lapses: currentState.lapses,
      rating: input.rating,
      now,
    });

    const [updatedState] = await this.prisma.$transaction([
      this.prisma.cardReviewState.upsert({
        where: { cardId },
        create: {
          cardId,
          state: scheduled.state,
          dueAt: scheduled.dueAt,
          intervalDays: scheduled.intervalDays,
          easeFactor: scheduled.easeFactor,
          repetitions: scheduled.repetitions,
          lapses: scheduled.lapses,
          lastReviewedAt: now,
        },
        update: {
          state: scheduled.state,
          dueAt: scheduled.dueAt,
          intervalDays: scheduled.intervalDays,
          easeFactor: scheduled.easeFactor,
          repetitions: scheduled.repetitions,
          lapses: scheduled.lapses,
          lastReviewedAt: now,
        },
      }),
      this.prisma.reviewLog.create({
        data: {
          cardId,
          rating: input.rating,
          typedAnswer: input.typedAnswer ?? null,
          answerResult: input.answerResult ?? null,
          previousIntervalDays: currentState.intervalDays,
          newIntervalDays: scheduled.intervalDays,
          easeFactorAfter: scheduled.easeFactor,
          dueAtAfter: scheduled.dueAt,
        },
      }),
    ]);

    this.logger.log({
      message: 'card graded',
      event: 'reviews.card_graded',
      method: this.gradeCard.name,
      data: {
        userId,
        cardId,
        rating: input.rating,
        newState: updatedState.state,
        intervalDays: updatedState.intervalDays,
      },
    });

    return {
      nextDueAt: updatedState.dueAt,
      intervalDays: updatedState.intervalDays,
      state: updatedState.state,
    };
  }

  private targetFormsForCard(card: CardWithDefinitionAndWord): string[] {
    const inflectionForms =
      (card.inflectionForms as InflectionForms | null) ??
      (card.definition.inflectionForms as InflectionForms | null);
    return collectTargetForms(
      card.definition.word.lemma,
      inflectionForms as unknown as Record<string, unknown> | null,
    );
  }

  private buildQueueItem(card: CardWithDeck, isNew: boolean): ReviewQueueItem {
    const forms = this.targetFormsForCard(card);
    const word = card.definition.word;

    const prompt: ReviewPrompt = {
      definition: card.definition.definition,
      example: maskText(card.definition.example, forms),
      contextMasked: maskText(card.context, forms),
      partOfSpeech: card.definition.partOfSpeech,
      kind: word.kind,
      lemmaLength: word.lemma.length,
      language: word.language,
    };

    return {
      cardId: card.id,
      deckId: card.deck.id,
      deckName: card.deck.name,
      isNew,
      prompt,
    };
  }
}
