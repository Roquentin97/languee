import { Injectable, Logger } from '@nestjs/common';
import { CardType, Prisma } from '@prisma/client';
import type {
  Card,
  CardAnkiDroidExport,
  Definition,
  Word,
} from '@prisma/client';
import { PrismaService } from '../core/prisma/prisma.service';
import { DecksService } from '../decks/decks.service';
import { DefinitionService } from '../definitions/definitions.service';
import { wordInflects } from './lib/inflects';
import {
  CardAlreadyExistsError,
  CardNotFoundError,
  DefinitionNotFoundError,
} from './cards.errors';
import type { InflectionForms } from '../dictionary/types/inflection-forms.types';

export type DeckRef = { id: string; name: string };

export type CardWithRelations = Card & {
  definition: (Definition & { word: Word }) | null;
  word: Word | null;
  decks: DeckRef[];
};

export type CardWithAnkiDroidExport = CardWithRelations & {
  ankidroidExport: CardAnkiDroidExport | null;
};

export type SavedSense = { definitionId: string; definition: string };

/** Fields written back to a card by the review scheduler. */
export type CardSchedulingUpdate = {
  state: Card['state'];
  dueAt: Date;
  stability: number;
  difficulty: number;
  scheduledDays: number;
  learningSteps: number;
  reps: number;
  lapses: number;
  lastReviewedAt: Date | null;
};

const RELATIONS_INCLUDE = {
  definition: { include: { word: true } },
  word: true,
  decks: { include: { deck: { select: { id: true, name: true } } } },
} satisfies Prisma.CardInclude;

const DETAIL_INCLUDE = {
  ...RELATIONS_INCLUDE,
  ankidroidExport: true,
} satisfies Prisma.CardInclude;

type RawCard = Prisma.CardGetPayload<{ include: typeof RELATIONS_INCLUDE }>;
type RawCardWithExport = Prisma.CardGetPayload<{
  include: typeof DETAIL_INCLUDE;
}>;

type TxClient = Prisma.TransactionClient;

function toDeckRefs(decks: RawCard['decks']): DeckRef[] {
  return decks.map((cardDeck) => ({
    id: cardDeck.deck.id,
    name: cardDeck.deck.name,
  }));
}

function toCardWithRelations(card: RawCard): CardWithRelations {
  const { decks, ...rest } = card;
  return { ...rest, decks: toDeckRefs(decks) };
}

function toCardWithAnkiDroidExport(
  card: RawCardWithExport,
): CardWithAnkiDroidExport {
  const { decks, ...rest } = card;
  return { ...rest, decks: toDeckRefs(decks) };
}

@Injectable()
export class CardsService {
  private readonly logger = new Logger(CardsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly decksService: DecksService,
    private readonly definitionService: DefinitionService,
  ) {}

  /**
   * Fans a single "save this word into this deck" request out into the
   * card(s) the definition needs: a `cloze` card and a `definition` card
   * always, plus a shared `inflection` card when the word's persisted NLP
   * paradigm actually inflects. Cards already generated for a definition (or
   * lemma + part of speech, for inflection cards) are reused - the deck is
   * simply joined - so saving the same sense into a second deck never
   * duplicates scheduling state. Throws `CardAlreadyExistsError` only when
   * this exact deck is already holding this definition.
   */
  async create(
    userId: string,
    deckId: string,
    definitionId: string,
    context?: string,
    inflectionForms?: InflectionForms | null,
  ): Promise<CardWithRelations[]> {
    await this.decksService.findOneOrThrow(deckId, userId);

    const definition =
      await this.definitionService.findByIdWithWord(definitionId);
    if (!definition) {
      throw new DefinitionNotFoundError();
    }

    const cardIds = await this.prisma.$transaction(async (tx) => {
      const clozeCard = await this.findOrCreateSenseCard(tx, {
        userId,
        type: CardType.cloze,
        definitionId,
        context: context ?? null,
        inflectionForms: inflectionForms ?? null,
      });

      const alreadyInDeck = await tx.cardDeck.findUnique({
        where: { cardId_deckId: { cardId: clozeCard.id, deckId } },
      });
      if (alreadyInDeck) {
        throw new CardAlreadyExistsError();
      }

      const definitionCard = await this.findOrCreateSenseCard(tx, {
        userId,
        type: CardType.definition,
        definitionId,
        context: null,
        inflectionForms: null,
      });

      const ids = [clozeCard.id, definitionCard.id];

      if (wordInflects(definition.inflectionForms as InflectionForms | null)) {
        const inflectionCard = await this.findOrCreateInflectionCard(tx, {
          userId,
          wordId: definition.wordId,
          partOfSpeech: definition.partOfSpeech,
          inflectionForms: definition.inflectionForms as InflectionForms | null,
        });
        ids.push(inflectionCard.id);
      }

      await tx.cardDeck.createMany({
        data: ids.map((cardId) => ({ cardId, deckId })),
        skipDuplicates: true,
      });

      return ids;
    });

    const created = await this.prisma.card.findMany({
      where: { id: { in: cardIds } },
      include: RELATIONS_INCLUDE,
    });
    const byId = new Map(created.map((card) => [card.id, card]));
    const result = cardIds
      .map((id) => byId.get(id))
      .filter((card): card is RawCard => card !== undefined)
      .map(toCardWithRelations);

    this.logger.log({
      message: 'cards created for deck',
      event: 'card.created',
      method: this.create.name,
      data: {
        userId,
        deckId,
        definitionId,
        cardIds,
        types: result.map((card) => card.type),
      },
    });

    return result;
  }

  async findManyByUserId(
    userId: string,
    filters: {
      deckId?: string;
      ankiDroidExportStatus?: 'none' | 'pending' | 'completed' | 'failed';
      failureReason?: string;
    } = {},
  ): Promise<CardWithAnkiDroidExport[]> {
    const where: Prisma.CardWhereInput = { userId };

    if (filters.deckId) {
      where.decks = { some: { deckId: filters.deckId } };
    }

    if (filters.ankiDroidExportStatus === 'none') {
      where.ankidroidExport = { is: null };
    } else if (filters.ankiDroidExportStatus) {
      const exportWhere: Prisma.CardAnkiDroidExportWhereInput = {
        status: filters.ankiDroidExportStatus,
      };
      if (filters.failureReason) {
        exportWhere.failureReason = filters.failureReason;
      }
      where.ankidroidExport = { is: exportWhere };
    } else if (filters.failureReason) {
      where.ankidroidExport = {
        is: { failureReason: filters.failureReason },
      };
    }

    const result = await this.prisma.card.findMany({
      where,
      include: DETAIL_INCLUDE,
    });

    this.logger.debug({
      message: 'cards found',
      event: 'card.query_result',
      method: this.findManyByUserId.name,
      data: { userId, filters, count: result.length },
    });

    return result.map(toCardWithAnkiDroidExport);
  }

  async findOneByIdAndUserId(
    id: string,
    userId: string,
  ): Promise<CardWithAnkiDroidExport | null> {
    const card = await this.prisma.card.findFirst({
      where: { id, userId },
      include: DETAIL_INCLUDE,
    });
    return card ? toCardWithAnkiDroidExport(card) : null;
  }

  async findOwnedOrThrow(
    id: string,
    userId: string,
  ): Promise<CardWithAnkiDroidExport> {
    const card = await this.findOneByIdAndUserId(id, userId);
    if (!card) throw new CardNotFoundError();
    return card;
  }

  /**
   * Decks each of the user's `cloze` cards for the given definitions
   * belongs to, flattened to one row per (definition, deck) pair. Used to
   * enrich vocabulary lookups with "already saved in these decks" info; the
   * `cloze` card is the anchor since every saved sense always has one.
   */
  async findCardsByDefinitionIdsAndUserId(
    definitionIds: string[],
    userId: string,
  ): Promise<Array<{ definitionId: string; deck: DeckRef }>> {
    const cards = await this.prisma.card.findMany({
      where: {
        definitionId: { in: definitionIds },
        userId,
        type: CardType.cloze,
      },
      select: {
        definitionId: true,
        decks: { select: { deck: { select: { id: true, name: true } } } },
      },
    });

    return cards.flatMap((card) =>
      // Guaranteed non-null: the query filters to `cloze` cards, which
      // always carry a definitionId.
      card.decks.map((cardDeck) => ({
        definitionId: card.definitionId as string,
        deck: cardDeck.deck,
      })),
    );
  }

  /** Cards due for review now, ordered soonest-first. */
  findDueCards(
    userId: string,
    deckId: string | undefined,
    now: Date,
    limit: number,
  ): Promise<CardWithRelations[]> {
    return this.prisma.card
      .findMany({
        where: {
          userId,
          state: { not: 'new' },
          dueAt: { lte: now },
          ...(deckId ? { decks: { some: { deckId } } } : {}),
        },
        include: RELATIONS_INCLUDE,
        orderBy: { dueAt: 'asc' },
        take: limit,
      })
      .then((cards) => cards.map(toCardWithRelations));
  }

  /** Cards never reviewed, oldest-first, optionally capped. */
  findUnreviewedCards(
    userId: string,
    deckId?: string,
    limit?: number,
  ): Promise<CardWithRelations[]> {
    return this.prisma.card
      .findMany({
        where: {
          userId,
          state: 'new',
          ...(deckId ? { decks: { some: { deckId } } } : {}),
        },
        include: RELATIONS_INCLUDE,
        orderBy: { createdAt: 'asc' },
        ...(limit !== undefined ? { take: limit } : {}),
      })
      .then((cards) => cards.map(toCardWithRelations));
  }

  countDue(userId: string, now: Date): Promise<number> {
    return this.prisma.card.count({
      where: { userId, state: { not: 'new' }, dueAt: { lte: now } },
    });
  }

  countNew(userId: string): Promise<number> {
    return this.prisma.card.count({ where: { userId, state: 'new' } });
  }

  /**
   * Sibling `cloze` card context per definition, for definition-card
   * hint 2 (falls back to the definition's dictionary example when absent).
   */
  async findClozeCardContexts(
    userId: string,
    definitionIds: string[],
  ): Promise<Map<string, string | null>> {
    const cards = await this.prisma.card.findMany({
      where: {
        userId,
        type: CardType.cloze,
        definitionId: { in: definitionIds },
      },
      select: { definitionId: true, context: true },
    });

    return new Map(
      cards.map((card) => [card.definitionId as string, card.context]),
    );
  }

  /**
   * The user's other saved senses (definition cards) for each of the given
   * words, grouped by wordId. Used to build definition-card hint 1.
   */
  async findSavedSensesByWordId(
    userId: string,
    wordIds: string[],
  ): Promise<Map<string, SavedSense[]>> {
    const cards = await this.prisma.card.findMany({
      where: {
        userId,
        type: CardType.definition,
        definition: { wordId: { in: wordIds } },
      },
      select: {
        definitionId: true,
        definition: { select: { wordId: true, definition: true } },
      },
    });

    const byWordId = new Map<string, SavedSense[]>();
    for (const card of cards) {
      if (!card.definitionId || !card.definition) continue;
      const senses = byWordId.get(card.definition.wordId) ?? [];
      senses.push({
        definitionId: card.definitionId,
        definition: card.definition.definition,
      });
      byWordId.set(card.definition.wordId, senses);
    }
    return byWordId;
  }

  /**
   * A lazy update, meant to be composed into a caller-owned `$transaction`
   * array alongside a `ReviewLog` write (see ReviewsService.gradeCard) so
   * both land atomically without ReviewsService touching the Card model
   * directly.
   */
  buildGradeUpdate(
    cardId: string,
    data: CardSchedulingUpdate,
  ): Prisma.PrismaPromise<Card> {
    return this.prisma.card.update({ where: { id: cardId }, data });
  }

  private async findOrCreateSenseCard(
    tx: TxClient,
    params: {
      userId: string;
      type: typeof CardType.cloze | typeof CardType.definition;
      definitionId: string;
      context: string | null;
      inflectionForms: InflectionForms | null;
    },
  ): Promise<Card> {
    const where = {
      userId_definitionId_type: {
        userId: params.userId,
        definitionId: params.definitionId,
        type: params.type,
      },
    };

    const existing = await tx.card.findUnique({ where });
    if (existing) return existing;

    try {
      return await tx.card.create({
        data: {
          userId: params.userId,
          type: params.type,
          definitionId: params.definitionId,
          context: params.context,
          inflectionForms: params.inflectionForms ?? Prisma.JsonNull,
        },
      });
    } catch (err: unknown) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        // Concurrent creation of the same sense card - re-fetch instead of
        // failing the whole fan-out.
        return tx.card.findUniqueOrThrow({ where });
      }
      throw err;
    }
  }

  private async findOrCreateInflectionCard(
    tx: TxClient,
    params: {
      userId: string;
      wordId: string;
      partOfSpeech: string;
      inflectionForms: InflectionForms | null;
    },
  ): Promise<Card> {
    const where = {
      userId_wordId_partOfSpeech_type: {
        userId: params.userId,
        wordId: params.wordId,
        partOfSpeech: params.partOfSpeech,
        type: CardType.inflection,
      },
    };

    const existing = await tx.card.findUnique({ where });
    if (existing) return existing;

    try {
      return await tx.card.create({
        data: {
          userId: params.userId,
          type: CardType.inflection,
          wordId: params.wordId,
          partOfSpeech: params.partOfSpeech,
          inflectionForms: params.inflectionForms ?? Prisma.JsonNull,
        },
      });
    } catch (err: unknown) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        return tx.card.findUniqueOrThrow({ where });
      }
      throw err;
    }
  }
}
