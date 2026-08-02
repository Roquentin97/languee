import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../core/prisma/prisma.service';
import { CardsService } from '../cards/cards.service';
import type { CardWithDefinitionAndWord } from '../cards/cards.service';
import { DecksService } from '../decks/decks.service';
import type { InflectionForms } from '../dictionary/types/inflection-forms.types';
import { collectTargetForms, maskText } from './lib/masking';
import { checkAnswer } from './lib/answer-matching';
import { NEW_CARD_SCHEDULING_STATE, scheduleReview } from './lib/scheduler';
import type {
  AnswerCheckOutcome,
  GradeInput,
  GradeOutcome,
  ReviewPrompt,
  ReviewQueueItem,
  ReviewSummary,
} from './reviews.types';

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

    if (deckId) {
      await this.decksService.findOneOrThrow(deckId, userId);
    }

    const now = new Date();

    const dueStates = await this.prisma.cardReviewState.findMany({
      where: {
        dueAt: { lte: now },
        card: { userId, ...(deckId ? { deckId } : {}) },
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
    const card = await this.cardsService.findOwnedOrThrow(cardId, userId);

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
    await this.cardsService.findOwnedOrThrow(cardId, userId);

    const existingState = await this.prisma.cardReviewState.findUnique({
      where: { cardId },
    });
    const currentState = existingState ?? NEW_CARD_SCHEDULING_STATE;

    const now = new Date();
    const scheduled = scheduleReview(currentState, input.rating, now);
    const persisted = {
      state: scheduled.state,
      dueAt: scheduled.dueAt,
      stability: scheduled.stability,
      difficulty: scheduled.difficulty,
      scheduledDays: scheduled.scheduledDays,
      learningSteps: scheduled.learningSteps,
      reps: scheduled.reps,
      lapses: scheduled.lapses,
      lastReviewedAt: scheduled.lastReviewedAt,
    };

    const [updatedState] = await this.prisma.$transaction([
      this.prisma.cardReviewState.upsert({
        where: { cardId },
        create: { cardId, ...persisted },
        update: persisted,
      }),
      this.prisma.reviewLog.create({
        data: {
          cardId,
          rating: input.rating,
          typedAnswer: input.typedAnswer ?? null,
          answerResult: input.answerResult ?? null,
          stateBefore: currentState.state,
          previousIntervalDays: currentState.scheduledDays,
          newIntervalDays: scheduled.scheduledDays,
          stabilityAfter: scheduled.stability,
          difficultyAfter: scheduled.difficulty,
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
        intervalDays: updatedState.scheduledDays,
        stability: updatedState.stability,
        difficulty: updatedState.difficulty,
      },
    });

    return {
      nextDueAt: updatedState.dueAt,
      intervalDays: updatedState.scheduledDays,
      state: updatedState.state,
    };
  }

  private targetFormsForCard(card: CardWithDefinitionAndWord): string[] {
    const inflectionForms =
      (card.inflectionForms as InflectionForms | null) ??
      (card.definition.inflectionForms as InflectionForms | null);
    return collectTargetForms(card.definition.word.lemma, inflectionForms);
  }

  private buildQueueItem(card: CardWithDeck, isNew: boolean): ReviewQueueItem {
    const forms = this.targetFormsForCard(card);
    const word = card.definition.word;

    const prompt: ReviewPrompt = {
      definition: card.definition.definition,
      maskedSentence:
        maskText(card.context, forms) ??
        maskText(card.definition.example, forms),
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
