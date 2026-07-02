import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { MeaningLink } from '@prisma/client';
import { PrismaService } from '../core/prisma/prisma.service';
import { CardsService } from '../cards/cards.service';
import {
  DefinitionService,
  type DefinitionSummary,
} from '../definitions/definitions.service';
import {
  DefinitionNotFoundError,
  MeaningLinkAlreadyExistsError,
  MeaningLinkNotFoundError,
  SelfLinkError,
} from './synonyms.errors';

export type MeaningLinkRelationType = 'synonym' | 'related';
export type MeaningLinkSourceType = 'user' | 'provider';

export type MeaningLinkWithDefinitions = MeaningLink & {
  definitionA: DefinitionSummary;
  definitionB: DefinitionSummary;
};

export type MeaningLinkListItem = {
  id: string;
  relationType: MeaningLinkRelationType;
  source: MeaningLinkSourceType;
  createdAt: Date;
  linked: {
    definitionId: string;
    definition: string;
    partOfSpeech: string;
    lemma: string;
    kind: string;
  };
};

export type SynonymAnswer = {
  definitionId: string;
  lemma: string;
  kind: string;
  relationType: MeaningLinkRelationType;
};

export type DefinitionOverlap = {
  definitionId: string;
  linkedDefinitionId: string;
  linkedLemma: string;
  relationType: MeaningLinkRelationType;
  decks: Array<{ id: string; name: string }>;
};

const DEFINITION_SELECT = {
  id: true,
  partOfSpeech: true,
  definition: true,
  word: { select: { lemma: true, kind: true } },
} as const;

@Injectable()
export class SynonymsService {
  private readonly logger = new Logger(SynonymsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cardsService: CardsService,
    private readonly definitionsService: DefinitionService,
  ) {}

  async createLink(input: {
    definitionAId: string;
    definitionBId: string;
    relationType: MeaningLinkRelationType;
    source?: MeaningLinkSourceType;
  }): Promise<MeaningLinkWithDefinitions> {
    if (input.definitionAId === input.definitionBId) {
      throw new SelfLinkError();
    }

    const [lowId, highId] =
      input.definitionAId < input.definitionBId
        ? [input.definitionAId, input.definitionBId]
        : [input.definitionBId, input.definitionAId];

    const definitions = await this.definitionsService.findManyByIds([
      lowId,
      highId,
    ]);
    const byId = new Map(definitions.map((d) => [d.id, d]));
    const missingIds = [lowId, highId].filter((id) => !byId.has(id));

    const definitionA = byId.get(lowId);
    const definitionB = byId.get(highId);
    if (
      missingIds.length > 0 ||
      definitionA === undefined ||
      definitionB === undefined
    ) {
      this.logger.log({
        message: 'definition not found while creating meaning link',
        event: 'synonyms.link_definition_not_found',
        method: this.createLink.name,
        data: { missingIds },
      });
      throw new DefinitionNotFoundError(missingIds);
    }

    const source = input.source ?? 'user';

    try {
      const link = await this.prisma.meaningLink.create({
        data: {
          definitionAId: lowId,
          definitionBId: highId,
          relationType: input.relationType,
          source,
        },
      });

      this.logger.log({
        message: 'meaning link created',
        event: 'synonyms.link_created',
        method: this.createLink.name,
        data: {
          linkId: link.id,
          definitionAId: lowId,
          definitionBId: highId,
          relationType: input.relationType,
        },
      });

      return { ...link, definitionA, definitionB };
    } catch (err: unknown) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        this.logger.log({
          message: 'duplicate meaning link',
          event: 'synonyms.link_duplicate',
          method: this.createLink.name,
          data: { definitionAId: lowId, definitionBId: highId },
        });
        throw new MeaningLinkAlreadyExistsError();
      }
      throw err;
    }
  }

  async listLinksForDefinition(
    definitionId: string,
  ): Promise<MeaningLinkListItem[]> {
    const links = await this.prisma.meaningLink.findMany({
      where: {
        OR: [{ definitionAId: definitionId }, { definitionBId: definitionId }],
      },
      include: {
        definitionA: { select: DEFINITION_SELECT },
        definitionB: { select: DEFINITION_SELECT },
      },
    });

    return links.map((link) => {
      const other =
        link.definitionAId === definitionId
          ? link.definitionB
          : link.definitionA;
      return {
        id: link.id,
        relationType: link.relationType,
        source: link.source,
        createdAt: link.createdAt,
        linked: {
          definitionId: other.id,
          definition: other.definition,
          partOfSpeech: other.partOfSpeech,
          lemma: other.word.lemma,
          kind: other.word.kind,
        },
      };
    });
  }

  async deleteLink(id: string): Promise<void> {
    try {
      await this.prisma.meaningLink.delete({ where: { id } });
      this.logger.log({
        message: 'meaning link deleted',
        event: 'synonyms.link_deleted',
        method: this.deleteLink.name,
        data: { linkId: id },
      });
    } catch (err: unknown) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2025'
      ) {
        throw new MeaningLinkNotFoundError();
      }
      throw err;
    }
  }

  async findSynonymAnswersForDefinition(
    definitionId: string,
  ): Promise<SynonymAnswer[]> {
    const links = await this.prisma.meaningLink.findMany({
      where: {
        OR: [{ definitionAId: definitionId }, { definitionBId: definitionId }],
      },
      include: {
        definitionA: { select: DEFINITION_SELECT },
        definitionB: { select: DEFINITION_SELECT },
      },
    });

    return links.map((link) => {
      const other =
        link.definitionAId === definitionId
          ? link.definitionB
          : link.definitionA;
      return {
        definitionId: other.id,
        lemma: other.word.lemma,
        kind: other.word.kind,
        relationType: link.relationType,
      };
    });
  }

  async findOverlapsForUser(
    userId: string,
    definitionIds: string[],
  ): Promise<DefinitionOverlap[]> {
    const uniqueIds = [...new Set(definitionIds)];

    const links = await this.prisma.meaningLink.findMany({
      where: {
        OR: [
          { definitionAId: { in: uniqueIds } },
          { definitionBId: { in: uniqueIds } },
        ],
      },
      select: {
        relationType: true,
        definitionAId: true,
        definitionBId: true,
        definitionA: {
          select: { id: true, word: { select: { lemma: true } } },
        },
        definitionB: {
          select: { id: true, word: { select: { lemma: true } } },
        },
      },
    });

    const definitionIdSet = new Set(uniqueIds);
    type Candidate = {
      definitionId: string;
      linkedDefinitionId: string;
      linkedLemma: string;
      relationType: MeaningLinkRelationType;
    };
    const candidates: Candidate[] = [];

    for (const link of links) {
      if (definitionIdSet.has(link.definitionAId)) {
        candidates.push({
          definitionId: link.definitionAId,
          linkedDefinitionId: link.definitionB.id,
          linkedLemma: link.definitionB.word.lemma,
          relationType: link.relationType,
        });
      }
      if (definitionIdSet.has(link.definitionBId)) {
        candidates.push({
          definitionId: link.definitionBId,
          linkedDefinitionId: link.definitionA.id,
          linkedLemma: link.definitionA.word.lemma,
          relationType: link.relationType,
        });
      }
    }

    this.logger.debug({
      message: 'overlap candidates collected',
      event: 'synonyms.overlap_candidates',
      method: this.findOverlapsForUser.name,
      data: {
        definitionCount: uniqueIds.length,
        candidateCount: candidates.length,
      },
    });

    if (candidates.length === 0) return [];

    const counterpartIds = [
      ...new Set(candidates.map((c) => c.linkedDefinitionId)),
    ];
    const cards = await this.cardsService.findCardsByDefinitionIdsAndUserId(
      counterpartIds,
      userId,
    );

    const decksByCounterpart = new Map<
      string,
      Array<{ id: string; name: string }>
    >();
    for (const card of cards) {
      const existing = decksByCounterpart.get(card.definitionId) ?? [];
      existing.push({ id: card.deck.id, name: card.deck.name });
      decksByCounterpart.set(card.definitionId, existing);
    }

    const overlapsByKey = new Map<string, DefinitionOverlap>();
    for (const candidate of candidates) {
      const decks = decksByCounterpart.get(candidate.linkedDefinitionId);
      if (decks === undefined || decks.length === 0) continue;

      const key = `${candidate.definitionId}:${candidate.linkedDefinitionId}:${candidate.relationType}`;
      if (overlapsByKey.has(key)) continue;

      overlapsByKey.set(key, {
        definitionId: candidate.definitionId,
        linkedDefinitionId: candidate.linkedDefinitionId,
        linkedLemma: candidate.linkedLemma,
        relationType: candidate.relationType,
        decks,
      });
    }

    const overlaps = [...overlapsByKey.values()];

    this.logger.log({
      message: 'overlaps computed',
      event: 'synonyms.overlaps_computed',
      method: this.findOverlapsForUser.name,
      data: {
        userId,
        definitionCount: uniqueIds.length,
        overlapCount: overlaps.length,
      },
    });

    return overlaps;
  }
}
