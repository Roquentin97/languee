import { Injectable, Logger } from '@nestjs/common';
import type { EvalDisagreementReason } from '@prisma/client';
import { PrismaService } from '../../system/core/prisma/prisma.service';
import { normalizeSpelling } from '../../lexicon/enrichment/morphology/morphology-provider';
import type { LookupWordOutput } from '../../lexicon/enrichment/dictionary/types/lookup-word.types';
import type { NlpWordAnalysis } from '../../lexicon/enrichment/nlp/nlp.interfaces';
import type { PartOfSpeech } from '../../lexicon/types/part-of-speech.enum';

type LookupEvaluationInput = {
  word: string;
  language: string;
  userId: string;
  context?: string;
  selectionStart?: number;
  selectionEnd?: number;
  disablePosFiltering?: boolean;
};
type RankedGroup = {
  wordId: string;
  lemma: string;
  partOfSpeech: PartOfSpeech;
};
type Ranking = { groups: RankedGroup[]; preferred: RankedGroup | null };

@Injectable()
export class LexicalEvaluationService {
  private readonly logger = new Logger(LexicalEvaluationService.name);
  private readonly queue: Array<{
    operation: string;
    run: () => Promise<void>;
  }> = [];
  private running = false;

  constructor(private readonly prisma: PrismaService) {}

  scheduleLookup(
    id: string,
    input: LookupEvaluationInput,
    analysis: NlpWordAnalysis,
    base: LookupWordOutput,
    ranked: Ranking,
  ): void {
    this.enqueue('lookup', () =>
      this.record(id, input, analysis, base, ranked),
    );
  }

  scheduleChoice(choice: {
    lookupId: string;
    userId: string;
    definitionId: string;
    wordId: string;
    lemma: string;
    pos: string;
  }): void {
    this.enqueue('choice', () => this.recordChoice(choice));
  }

  private enqueue(operation: string, run: () => Promise<void>): void {
    if (this.queue.length >= 256) {
      this.logFailure(operation);
      return;
    }
    this.queue.push({ operation, run });
    if (this.running) return;
    this.running = true;
    setImmediate(() => void this.drain());
  }

  private async drain(): Promise<void> {
    while (this.queue.length) {
      const task = this.queue.shift()!;
      try {
        await task.run();
      } catch {
        this.logFailure(task.operation);
      }
    }
    this.running = false;
  }

  private logFailure(operation: string): void {
    this.logger.error({
      message: 'lexical evaluation persistence failed',
      operation,
    });
  }

  private async recordChoice(choice: {
    lookupId: string;
    userId: string;
    definitionId: string;
    wordId: string;
    lemma: string;
    pos: string;
  }): Promise<void> {
    let lookup = await this.prisma.evalLexicalLookup.findFirst({
      where: { id: choice.lookupId, userId: choice.userId },
      include: { disagreement: true },
    });
    for (let attempt = 0; !lookup && attempt < 3; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      lookup = await this.prisma.evalLexicalLookup.findFirst({
        where: { id: choice.lookupId, userId: choice.userId },
        include: { disagreement: true },
      });
    }
    if (!lookup) return;
    const offered =
      Array.isArray(lookup.candidates) &&
      lookup.candidates.some(
        (group) =>
          group &&
          typeof group === 'object' &&
          !Array.isArray(group) &&
          Array.isArray(group.definitionIds) &&
          group.definitionIds.includes(choice.definitionId),
      );
    const changed =
      lookup.preferredWordId !== null &&
      (lookup.preferredWordId !== choice.wordId ||
        lookup.preferredPos !== choice.pos);
    if (!offered || (!lookup.disagreement && !changed)) return;
    await this.prisma.evalLexicalLearnerChoice.upsert({
      where: { lookupId: choice.lookupId },
      update: {},
      create: {
        lookupId: choice.lookupId,
        chosenDefinitionId: choice.definitionId,
        chosenWordId: choice.wordId,
        chosenLemma: choice.lemma,
        chosenPos: choice.pos,
      },
    });
  }

  private async record(
    id: string,
    input: LookupEvaluationInput,
    analysis: NlpWordAnalysis,
    base: LookupWordOutput,
    presented: Ranking,
  ): Promise<void> {
    if (!analysis.modelVersion) throw new Error('NLP model identity missing');
    const contextual = Boolean(input.context?.trim()) && analysis.pos !== null;
    const candidates = this.candidates(base, presented.groups, input.word);
    const reason = this.reason(presented.groups, analysis, contextual);
    await this.prisma.evalLexicalLookup.create({
      data: {
        id,
        userId: input.userId,
        language: input.language,
        surface: input.word,
        context: input.context ?? null,
        selectionStart: input.selectionStart ?? null,
        selectionEnd: input.selectionEnd ?? null,
        nlpLemma: analysis.lemma,
        nlpPos: analysis.rawPos ?? null,
        nlpModelVersion: analysis.modelVersion,
        rankingPolicyVersion: '1',
        candidates,
        preferredWordId: presented.preferred?.wordId ?? null,
        preferredPos: presented.preferred?.partOfSpeech ?? null,
        ...this.disagreement(reason),
      },
    });
  }

  private disagreement(reason: ReturnType<LexicalEvaluationService['reason']>) {
    if (!reason) return {};
    return {
      disagreement: {
        create: {
          reason,
          outcome:
            reason === 'unique_pos_candidate'
              ? ('resolved_override' as const)
              : ('unresolved' as const),
        },
      },
    };
  }

  private candidates(
    base: LookupWordOutput,
    groups: RankedGroup[],
    surface: string,
  ) {
    return groups.map((group) => {
      const word = base.headwords.find((w) => w.wordId === group.wordId)!;
      const pos = word.partsOfSpeech.find(
        (p) => p.partOfSpeech === group.partOfSpeech,
      )!;
      return {
        ...group,
        relationships: [
          ...(normalizeSpelling(word.lemma) === normalizeSpelling(surface)
            ? [
                {
                  partOfSpeech: String(group.partOfSpeech),
                  relationType: 'exact',
                },
              ]
            : []),
          ...word.relations.filter(
            (r) => r.partOfSpeech === String(group.partOfSpeech),
          ),
        ],
        definitionIds: pos.definitions.map((d) => d.id),
      };
    });
  }

  private reason(
    groups: RankedGroup[],
    analysis: NlpWordAnalysis,
    contextual: boolean,
  ): EvalDisagreementReason | null {
    const samePos = groups.filter((g) => g.partOfSpeech === analysis.pos);
    const exact = samePos.some(
      (g) => normalizeSpelling(g.lemma) === normalizeSpelling(analysis.lemma),
    );
    return !contextual || exact
      ? null
      : samePos.length === 0
        ? 'no_pos_candidate'
        : samePos.length === 1
          ? 'unique_pos_candidate'
          : 'multiple_pos_candidates';
  }
}
