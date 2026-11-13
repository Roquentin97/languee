import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { EvalDisagreementReason } from '@prisma/client';
import { PrismaService } from '../../system/core/prisma/prisma.service';
import { rankLexicalGroups } from './lexical-ranking';
import { normalizeSpelling } from '../../lexicon/enrichment/morphology/morphology-provider';
import type { LookupWordOutput } from '../../lexicon/enrichment/dictionary/types/lookup-word.types';
import type { NlpWordAnalysis } from '../../lexicon/enrichment/nlp/nlp.interfaces';
import type { LookupVocabularyInput } from './types/lookup-vocabulary.types';

@Injectable()
export class LexicalEvaluationService {
  constructor(private readonly prisma: PrismaService) {}

  async record(
    input: LookupVocabularyInput,
    analysis: NlpWordAnalysis,
    base: LookupWordOutput,
  ): Promise<string> {
    if (!analysis.modelVersion) throw new Error('NLP model identity missing');
    const contextual = Boolean(input.context?.trim()) && analysis.pos !== null;
    const evaluated = rankLexicalGroups(
      base.headwords,
      analysis.lemma,
      analysis.pos,
      contextual,
    );
    const presented = rankLexicalGroups(
      base.headwords,
      analysis.lemma,
      analysis.pos,
      contextual && !input.disablePosFiltering,
    );
    const candidates = this.candidates(base, presented.groups, input.word);
    const reason = this.reason(evaluated.groups, analysis, contextual);
    const id = randomUUID();
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
    return id;
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
    groups: ReturnType<typeof rankLexicalGroups>['groups'],
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
    groups: ReturnType<typeof rankLexicalGroups>['groups'],
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
