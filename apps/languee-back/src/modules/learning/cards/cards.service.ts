import type { LexicalParadigm } from '../../lexicon/enrichment/morphology/morphology.types';
import { MorphologyService } from '../../lexicon/enrichment/morphology/morphology.service';
import { Injectable, Logger } from '@nestjs/common';
import { CardType, Prisma } from '@prisma/client';
import type {
  Card,
  CardAnkiDroidExport,
  Definition,
  Word,
} from '@prisma/client';
import { PrismaService } from '../../system/core/prisma/prisma.service';
import { DecksService } from '../decks/decks.service';
import { DefinitionService } from '../../lexicon/entries/definitions/definitions.service';
import { wordInflects } from './lib/inflects';
import {
  CardAlreadyExistsError,
  CardNotFoundError,
  DefinitionNotFoundError,
} from './cards.errors';
import type { InflectionForms } from '../../lexicon/types/inflection-forms.types';

export type DeckRef = { id: string; name: string };

export type CardWithRelations = Card & {
  definition: (Definition & { word: Word }) | null;
  word: Word | null;
  decks: DeckRef[];
  lexicalInflectionForms?: InflectionForms | null;
};

export type CardWithAnkiDroidExport = CardWithRelations & {
  ankidroidExport: CardAnkiDroidExport | null;
};

export type SavedSense = { definitionId: string; definition: string };

export type SavedVocabularyCandidate = {
  definitionId: string;
  partOfSpeech: string;
  definition: string;
  word: {
    id: string;
    lemma: string;
    forms: Array<{ form: string; partOfSpeech: string }>;
  };
  decks: DeckRef[];
};

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

type CreateDeckCardsInput = {
  userId: string;
  deckId: string;
  definition: Definition & { word: Word };
  context?: string;
  snapshot: InflectionForms | null;
  paradigm: LexicalParadigm | undefined;
  lexicalSnapshot: InflectionForms | null;
};

type TxClient = Prisma.TransactionClient;

function toDeckRefs(decks: RawCard['decks']): DeckRef[] {
  return decks.map((cardDeck) => ({
    id: cardDeck.deck.id,
    name: cardDeck.deck.name,
  }));
}

function toCardWithRelations(card: RawCard): CardWithRelations {
  const { decks, ...rest } = card;
  return {
    ...rest,
    decks: toDeckRefs(decks),
  };
}

function toCardWithAnkiDroidExport(
  card: RawCardWithExport,
): CardWithAnkiDroidExport {
  const { decks, ...rest } = card;
  return {
    ...rest,
    decks: toDeckRefs(decks),
  };
}

@Injectable()
export class CardsService {
  private readonly logger = new Logger(CardsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly decksService: DecksService,
    private readonly definitionService: DefinitionService,
    private readonly morphology: MorphologyService,
  ) {}

  /**
   * Creates cards for a definition and adds them to a deck.
   * Throws `CardAlreadyExistsError` if the deck already contains the sense.
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

    const paradigms = await this.morphology.describeEntries([
      {
        wordId: definition.wordId,
        lemma: definition.word.lemma,
        partOfSpeech: definition.partOfSpeech,
      },
    ]);
    const paradigm = paradigms
      .get(definition.wordId)
      ?.get(definition.partOfSpeech);
    const lexicalSnapshot = paradigm?.snapshot ?? null;
    const snapshot =
      definition.word.kind === 'word'
        ? lexicalSnapshot
        : (inflectionForms ?? null);
    const cardIds = await this.createDeckCards({
      userId,
      deckId,
      definition,
      context,
      snapshot,
      paradigm,
      lexicalSnapshot,
    });

    const result = await this.findCardsInOrder(cardIds);

    this.logCreatedCards(userId, deckId, definitionId, cardIds, result);

    return this.withLexicalMorphology(result);
  }

  private logCreatedCards(
    userId: string,
    deckId: string,
    definitionId: string,
    cardIds: string[],
    result: CardWithRelations[],
  ): void {
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
  }

  private async findCardsInOrder(
    cardIds: string[],
  ): Promise<CardWithRelations[]> {
    const created = await this.prisma.card.findMany({
      where: { id: { in: cardIds } },
      include: RELATIONS_INCLUDE,
    });
    const byId = new Map(created.map((card) => [card.id, card]));
    const result = cardIds
      .map((id) => byId.get(id))
      .filter((card): card is RawCard => card !== undefined)
      .map(toCardWithRelations);

    return result;
  }

  private async createDeckCards({
    userId,
    deckId,
    definition,
    context,
    snapshot,
    paradigm,
    lexicalSnapshot,
  }: CreateDeckCardsInput): Promise<string[]> {
    return this.prisma.$transaction(async (tx) => {
      const clozeCard = await this.findOrCreateSenseCard(tx, {
        userId,
        type: CardType.cloze,
        definitionId: definition.id,
        context: context ?? null,
        inflectionForms: snapshot,
      });

      await this.addClozeMembership(tx, clozeCard.id, deckId);

      const definitionCard = await this.findOrCreateSenseCard(tx, {
        userId,
        type: CardType.definition,
        definitionId: definition.id,
        context: null,
        inflectionForms: null,
      });

      const ids = [clozeCard.id, definitionCard.id];

      await this.addInflectionCard(tx, ids, {
        userId,
        definition,
        paradigm,
        lexicalSnapshot,
      });

      await tx.cardDeck.createMany({
        data: ids.slice(1).map((cardId) => ({ cardId, deckId })),
        skipDuplicates: true,
      });

      return ids;
    });
  }

  private async addClozeMembership(
    tx: TxClient,
    cardId: string,
    deckId: string,
  ): Promise<void> {
    const alreadyInDeck = await tx.cardDeck.findUnique({
      where: { cardId_deckId: { cardId, deckId } },
    });
    if (alreadyInDeck) throw new CardAlreadyExistsError();

    const membership = await tx.cardDeck.createMany({
      data: [{ cardId, deckId }],
      skipDuplicates: true,
    });
    if (membership.count === 0) throw new CardAlreadyExistsError();
  }

  private async addInflectionCard(
    tx: TxClient,
    ids: string[],
    {
      userId,
      definition,
      paradigm,
      lexicalSnapshot,
    }: Pick<
      CreateDeckCardsInput,
      'userId' | 'definition' | 'paradigm' | 'lexicalSnapshot'
    >,
  ): Promise<void> {
    if (paradigm?.hasIrregularForms && wordInflects(paradigm.inflectionForms)) {
      const inflectionCard = await this.findOrCreateInflectionCard(tx, {
        userId,
        wordId: definition.wordId,
        partOfSpeech: definition.partOfSpeech,
        inflectionForms: lexicalSnapshot,
      });
      ids.push(inflectionCard.id);
    }
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

    return this.withLexicalMorphology(result.map(toCardWithAnkiDroidExport));
  }

  async findOneByIdAndUserId(
    id: string,
    userId: string,
  ): Promise<CardWithAnkiDroidExport | null> {
    const card = await this.prisma.card.findFirst({
      where: { id, userId },
      include: DETAIL_INCLUDE,
    });
    if (!card) return null;
    const [enriched] = await this.withLexicalMorphology([
      toCardWithAnkiDroidExport(card),
    ]);
    return enriched;
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

  async findSavedVocabularyCandidates(
    userId: string,
    language: string,
    tokens: string[],
  ): Promise<SavedVocabularyCandidate[]> {
    if (!tokens.length) return [];
    const cards = await this.prisma.card.findMany({
      where: this.savedVocabularyWhere(userId, language, tokens),
      select: {
        definition: {
          select: {
            id: true,
            partOfSpeech: true,
            definition: true,
            word: {
              select: {
                id: true,
                lemma: true,
                forms: {
                  where: { form: { in: tokens, mode: 'insensitive' } },
                  select: { form: true, partOfSpeech: true },
                },
              },
            },
          },
        },
        decks: { select: { deck: { select: { id: true, name: true } } } },
      },
    });
    return cards.flatMap((card) => {
      if (!card.definition) return [];
      return [
        {
          definitionId: card.definition.id,
          partOfSpeech: card.definition.partOfSpeech,
          definition: card.definition.definition,
          word: card.definition.word,
          decks: card.decks.map((entry) => entry.deck),
        },
      ];
    });
  }

  private savedVocabularyWhere(
    userId: string,
    language: string,
    tokens: string[],
  ): Prisma.CardWhereInput {
    return {
      userId,
      type: CardType.cloze,
      definition: {
        is: {
          word: {
            language,
            OR: [
              { lemma: { in: tokens, mode: 'insensitive' } },
              {
                forms: { some: { form: { in: tokens, mode: 'insensitive' } } },
              },
            ],
          },
        },
      },
    };
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
      .then((cards) =>
        this.withLexicalMorphology(cards.map(toCardWithRelations)),
      );
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
      .then((cards) =>
        this.withLexicalMorphology(cards.map(toCardWithRelations)),
      );
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

  private async withLexicalMorphology<T extends CardWithRelations>(
    cards: T[],
  ): Promise<T[]> {
    const entries = cards.flatMap((card) =>
      card.definition
        ? [
            {
              wordId: card.definition.wordId,
              lemma: card.definition.word.lemma,
              partOfSpeech: card.definition.partOfSpeech,
            },
          ]
        : [],
    );
    const paradigms = await this.morphology.describeEntries(entries);
    return cards.map((card) => ({
      ...card,
      lexicalInflectionForms: card.definition
        ? (paradigms
            .get(card.definition.wordId)
            ?.get(card.definition.partOfSpeech)?.inflectionForms ?? null)
        : null,
    }));
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
