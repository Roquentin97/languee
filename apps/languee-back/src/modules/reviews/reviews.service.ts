import { Injectable, Logger } from '@nestjs/common';
import type { Definition, Word } from '@prisma/client';
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

type BareCardWithDeck = {
  id: string;
  context: string | null;
  inflectionForms: unknown;
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
    const [dueCount, unreviewedCards] = await Promise.all([
      this.prisma.definitionReviewState.count({
        where: { userId, dueAt: { lte: now } },
      }),
      this.cardsService.findUnreviewedCards(userId),
    ]);

    return {
      dueCount,
      newCount: this.pickOnePerDefinition(unreviewedCards).length,
    };
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
    const cardFilter = { userId, ...(deckId ? { deckId } : {}) };

    const dueStates = await this.prisma.definitionReviewState.findMany({
      where: {
        userId,
        dueAt: { lte: now },
        definition: { cards: { some: cardFilter } },
      },
      include: {
        definition: {
          include: {
            word: true,
            cards: {
              where: cardFilter,
              select: {
                id: true,
                context: true,
                inflectionForms: true,
                deck: { select: { id: true, name: true } },
              },
              orderBy: { createdAt: 'desc' },
            },
          },
        },
      },
      orderBy: { dueAt: 'asc' },
      take: limit,
    });

    const remaining = limit - dueStates.length;
    const newCards =
      remaining > 0
        ? this.pickOnePerDefinition(
            await this.cardsService.findUnreviewedCards(userId, deckId),
          ).slice(0, remaining)
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
      ...dueStates.map((state) => {
        const { cards, ...definition } = state.definition;
        return this.buildDueQueueItem(
          definition,
          this.pickRepresentative(cards),
        );
      }),
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
      const word = card.definition.word;
      const inflectionForms =
        (card.inflectionForms as Record<string, string> | null) ??
        (card.definition.inflectionForms as Record<string, string> | null);
      return {
        result: 'correct',
        matchedForm: outcome.matchedForm,
        revealed: {
          lemma: word.lemma,
          ipa: word.ipa,
          inflectionForms,
        },
      };
    }
    return { result: 'incorrect', matchedForm: null, revealed: null };
  }

  async gradeCard(
    userId: string,
    cardId: string,
    input: GradeInput,
  ): Promise<GradeOutcome> {
    const card = await this.cardsService.findOwnedOrThrow(cardId, userId);
    const definitionId = card.definitionId;

    // Scheduling state is shared across every deck holding this definition:
    // grading through any of its cards advances the single schedule.
    const existingState = await this.prisma.definitionReviewState.findUnique({
      where: { userId_definitionId: { userId, definitionId } },
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
      this.prisma.definitionReviewState.upsert({
        where: { userId_definitionId: { userId, definitionId } },
        create: { userId, definitionId, ...persisted },
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
        definitionId,
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

  /**
   * A definition saved into several decks yields several cards but must appear
   * only once per review session. Keep one card per definition, preferring one
   * with a captured context since it makes the better prompt.
   */
  private pickOnePerDefinition(cards: CardWithDeck[]): CardWithDeck[] {
    const byDefinition = new Map<string, CardWithDeck>();
    for (const card of cards) {
      const existing = byDefinition.get(card.definitionId);
      if (!existing) {
        byDefinition.set(card.definitionId, card);
      } else if (existing.context === null && card.context !== null) {
        byDefinition.set(card.definitionId, card);
      }
    }
    return [...byDefinition.values()];
  }

  private pickRepresentative(cards: BareCardWithDeck[]): BareCardWithDeck {
    const withContext = cards.find((card) => card.context !== null);
    const representative = withContext ?? cards[0];
    if (!representative) {
      // Unreachable: the due-state query requires at least one matching card.
      throw new Error('review state without a matching card');
    }
    return representative;
  }

  private targetFormsForCard(card: CardWithDefinitionAndWord): string[] {
    const inflectionForms =
      (card.inflectionForms as InflectionForms | null) ??
      (card.definition.inflectionForms as InflectionForms | null);
    return collectTargetForms(card.definition.word.lemma, inflectionForms);
  }

  private buildDueQueueItem(
    definition: Definition & { word: Word },
    card: BareCardWithDeck,
  ): ReviewQueueItem {
    return this.buildQueueItem(
      {
        ...card,
        definitionId: definition.id,
        definition,
        inflectionForms:
          card.inflectionForms as CardWithDeck['inflectionForms'],
      } as CardWithDeck,
      false,
    );
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
