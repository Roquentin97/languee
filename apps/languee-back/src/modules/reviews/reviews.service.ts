import { Injectable, Logger } from '@nestjs/common';
import { CardType, Prisma } from '@prisma/client';
import { PrismaService } from '../core/prisma/prisma.service';
import { CardsService } from '../cards/cards.service';
import type {
  CardSchedulingUpdate,
  CardWithRelations,
  SavedSense,
} from '../cards/cards.service';
import { DecksService } from '../decks/decks.service';
import type { InflectionForms } from '../dictionary/types/inflection-forms.types';
import { collectTargetForms, maskText } from './lib/masking';
import { checkAnswer } from './lib/answer-matching';
import { checkTypedForms, formKeysFor } from './lib/inflection-payload';
import { truncateGloss } from './lib/definition-hints';
import { scheduleReview } from './lib/scheduler';
import type { ReviewSchedulingState } from './lib/scheduler';
import { UnsupportedCardTypeError } from './reviews.errors';
import type {
  AnswerCheckOutcome,
  ClozeCardPayload,
  DefinitionCardPayload,
  FormCheckOutcome,
  GradeInput,
  GradeOutcome,
  InflectionCardPayload,
  ReviewQueueItem,
  ReviewSummary,
} from './reviews.types';

type DefinitionHints = {
  hint1: string[] | null;
  hint2: string | null;
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
    const [dueCount, newCount] = await Promise.all([
      this.cardsService.countDue(userId, now),
      this.cardsService.countNew(userId),
    ]);

    return { dueCount, newCount };
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
    const dueCards = await this.cardsService.findDueCards(
      userId,
      deckId,
      now,
      limit,
    );
    const remaining = limit - dueCards.length;
    const newCards =
      remaining > 0
        ? await this.cardsService.findUnreviewedCards(userId, deckId, remaining)
        : [];

    this.logger.debug({
      message: 'review queue assembled',
      event: 'reviews.queue_assembled',
      method: this.getQueue.name,
      data: {
        userId,
        deckId,
        limit,
        dueCount: dueCards.length,
        newCount: newCards.length,
      },
    });

    const hints = await this.buildDefinitionHints(userId, [
      ...dueCards,
      ...newCards,
    ]);

    return [
      ...dueCards.map((card) => this.buildQueueItem(card, false, hints)),
      ...newCards.map((card) => this.buildQueueItem(card, true, hints)),
    ];
  }

  async checkTypedAnswer(
    userId: string,
    cardId: string,
    typedAnswer: string,
  ): Promise<AnswerCheckOutcome> {
    const card = await this.cardsService.findOwnedOrThrow(cardId, userId);
    if (card.type !== CardType.cloze || !card.definition) {
      throw new UnsupportedCardTypeError(
        'Only `cloze` cards support typed-answer checking',
      );
    }

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

  async checkForms(
    userId: string,
    cardId: string,
    typedForms: Record<string, string>,
  ): Promise<FormCheckOutcome> {
    const card = await this.cardsService.findOwnedOrThrow(cardId, userId);
    if (card.type !== CardType.inflection || !card.word) {
      throw new UnsupportedCardTypeError(
        'Only `inflection` cards support form checking',
      );
    }

    const inflectionForms = card.inflectionForms as InflectionForms | null;
    if (!inflectionForms) {
      throw new UnsupportedCardTypeError(
        `Inflection card ${cardId} has no stored paradigm to check against`,
      );
    }

    const results = checkTypedForms(inflectionForms, typedForms);
    const allCorrect = Object.values(results).every((entry) => entry.correct);

    return {
      results,
      allCorrect,
      revealed: {
        lemma: card.word.lemma,
        ipa: card.word.ipa,
        inflectionForms: card.inflectionForms as Record<string, string>,
      },
    };
  }

  async gradeCard(
    userId: string,
    cardId: string,
    input: GradeInput,
  ): Promise<GradeOutcome> {
    const card = await this.cardsService.findOwnedOrThrow(cardId, userId);

    const currentState: ReviewSchedulingState = {
      state: card.state,
      stability: card.stability,
      difficulty: card.difficulty,
      scheduledDays: card.scheduledDays,
      learningSteps: card.learningSteps,
      reps: card.reps,
      lapses: card.lapses,
      lastReviewedAt: card.lastReviewedAt,
    };

    const now = new Date();
    const scheduled = scheduleReview(currentState, input.rating, now);
    const persisted: CardSchedulingUpdate = {
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

    // CardsService owns writes to the Card model; ReviewsService only
    // composes its lazy update into this transaction alongside the
    // ReviewLog it owns, so both land atomically.
    const [updatedCard] = await this.prisma.$transaction([
      this.cardsService.buildGradeUpdate(cardId, persisted),
      this.prisma.reviewLog.create({
        data: {
          cardId,
          rating: input.rating,
          typedAnswer: input.typedAnswer ?? null,
          typedForms: input.typedForms ?? Prisma.JsonNull,
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
        type: card.type,
        rating: input.rating,
        newState: updatedCard.state,
        intervalDays: updatedCard.scheduledDays,
        stability: updatedCard.stability,
        difficulty: updatedCard.difficulty,
      },
    });

    return {
      nextDueAt: updatedCard.dueAt,
      intervalDays: updatedCard.scheduledDays,
      state: updatedCard.state,
    };
  }

  private targetFormsForCard(card: CardWithRelations): string[] {
    if (!card.definition) return [];
    const inflectionForms =
      (card.inflectionForms as InflectionForms | null) ??
      (card.definition.inflectionForms as InflectionForms | null);
    return collectTargetForms(card.definition.word.lemma, inflectionForms);
  }

  private buildQueueItem(
    card: CardWithRelations,
    isNew: boolean,
    hints: Map<string, DefinitionHints>,
  ): ReviewQueueItem {
    const base: ReviewQueueItem = {
      cardId: card.id,
      type: card.type,
      decks: card.decks,
      isNew,
      cloze: null,
      inflection: null,
      definition: null,
    };

    switch (card.type) {
      case CardType.cloze:
        return { ...base, cloze: this.buildClozePayload(card) };
      case CardType.inflection:
        return { ...base, inflection: this.buildInflectionPayload(card) };
      case CardType.definition:
        return {
          ...base,
          definition: this.buildDefinitionPayload(card, hints.get(card.id)),
        };
    }
  }

  private buildClozePayload(card: CardWithRelations): ClozeCardPayload {
    if (!card.definition) {
      throw new Error(`cloze card ${card.id} is missing its definition`);
    }
    const word = card.definition.word;
    const forms = this.targetFormsForCard(card);

    return {
      definition: card.definition.definition,
      maskedSentence:
        maskText(card.context, forms) ??
        maskText(card.definition.example, forms),
      partOfSpeech: card.definition.partOfSpeech,
      kind: word.kind,
      lemmaLength: word.lemma.length,
      language: word.language,
    };
  }

  private buildInflectionPayload(
    card: CardWithRelations,
  ): InflectionCardPayload {
    if (!card.word) {
      throw new Error(`inflection card ${card.id} is missing its word`);
    }
    const inflectionForms = card.inflectionForms as InflectionForms | null;

    return {
      lemma: card.word.lemma,
      partOfSpeech: card.partOfSpeech ?? '',
      kind: card.word.kind,
      language: card.word.language,
      formKeys: inflectionForms ? formKeysFor(inflectionForms) : [],
    };
  }

  private buildDefinitionPayload(
    card: CardWithRelations,
    hints: DefinitionHints | undefined,
  ): DefinitionCardPayload {
    if (!card.definition) {
      throw new Error(`definition card ${card.id} is missing its definition`);
    }
    const word = card.definition.word;

    return {
      lemma: word.lemma,
      partOfSpeech: card.definition.partOfSpeech,
      kind: word.kind,
      language: word.language,
      hint1: hints?.hint1 ?? null,
      hint2: hints?.hint2 ?? null,
    };
  }

  /**
   * Batches the sibling-context and other-saved-senses lookups for every
   * `definition` card in a queue result, so building N hint payloads costs a
   * constant two queries instead of N.
   */
  private async buildDefinitionHints(
    userId: string,
    cards: CardWithRelations[],
  ): Promise<Map<string, DefinitionHints>> {
    const definitionCards = cards.filter(
      (card) => card.type === CardType.definition && card.definition,
    );
    const result = new Map<string, DefinitionHints>();
    if (definitionCards.length === 0) return result;

    const definitionIds = definitionCards
      .map((card) => card.definitionId)
      .filter((id): id is string => id !== null);
    const wordIds = [
      ...new Set(definitionCards.map((card) => card.definition?.word.id ?? '')),
    ].filter((id) => id.length > 0);

    const [contexts, savedSensesByWord] = await Promise.all([
      this.cardsService.findClozeCardContexts(userId, definitionIds),
      this.cardsService.findSavedSensesByWordId(userId, wordIds),
    ]);

    for (const card of definitionCards) {
      if (!card.definitionId || !card.definition) continue;

      const siblings: SavedSense[] = (
        savedSensesByWord.get(card.definition.word.id) ?? []
      ).filter((sense) => sense.definitionId !== card.definitionId);

      const hint1 =
        siblings.length > 0
          ? siblings.map((sense) => truncateGloss(sense.definition))
          : null;
      const hint2 =
        contexts.get(card.definitionId) ?? card.definition.example ?? null;

      result.set(card.id, { hint1, hint2 });
    }

    return result;
  }
}
