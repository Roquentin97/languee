import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../core/prisma/prisma.service';
import { WordsService } from '../words/words.service';
import { DefinitionService } from '../definitions/definitions.service';
import { SynonymsService } from '../synonyms/synonyms.service';
import { analyzeOveruse } from './analysis/overuse.analyzer';
import { analyzeGrammar } from './analysis/grammar.analyzer';
import { analyzeStyle } from './analysis/style.analyzer';
import { fingerprintOf } from './analysis/fingerprint';
import type { ChatSuggestionType } from './chat.types';

const MAX_SYNONYMS = 5;
const SYNONYM_LANGUAGE = 'en';

type SuggestionInput = {
  type: ChatSuggestionType;
  title: string;
  detail: string;
  payload: Prisma.InputJsonValue;
};

@Injectable()
export class ChatAnalysisService {
  private readonly logger = new Logger(ChatAnalysisService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly wordsService: WordsService,
    private readonly definitionService: DefinitionService,
    private readonly synonymsService: SynonymsService,
  ) {}

  /**
   * Loads a conversation's user messages, runs the overuse/grammar/style
   * analyzers, enriches overused words with synonyms via WordsService /
   * DefinitionService / SynonymsService (the only cross-module access this
   * service performs — no Prisma calls on other modules' models), then
   * atomically replaces the conversation's suggestions and stamps
   * analyzedAt.
   */
  async analyzeConversation(conversationId: string): Promise<void> {
    const userMessages = await this.prisma.chatMessage.findMany({
      where: { conversationId, role: 'user' },
      orderBy: { createdAt: 'asc' },
    });

    const contents = userMessages.map((m) => m.content);
    const messagesWithIds = userMessages.map((m) => ({
      id: m.id,
      content: m.content,
    }));

    const overuseCandidates = analyzeOveruse(contents);
    const grammarFindings = analyzeGrammar(messagesWithIds);
    const styleFindings = analyzeStyle(contents);

    const overuseSuggestions: SuggestionInput[] = await Promise.all(
      overuseCandidates.map(async (candidate) => {
        const synonyms = await this.findSynonyms(candidate.word);
        const synonymText =
          synonyms.length > 0
            ? ` Try alternatives like: ${synonyms.join(', ')}.`
            : '';
        return {
          type: 'overused_word',
          title: `You used "${candidate.word}" ${candidate.count} times`,
          detail: `Consider varying your word choice instead of repeating "${candidate.word}".${synonymText}`,
          payload: {
            word: candidate.word,
            count: candidate.count,
            ratio: candidate.ratio,
            synonyms,
          },
        };
      }),
    );

    const grammarSuggestions: SuggestionInput[] = grammarFindings.map(
      (finding) => ({
        type: 'grammar',
        title: finding.title,
        detail: finding.detail,
        payload: {
          rule: finding.rule,
          excerpt: finding.excerpt,
          messageId: finding.messageId,
        },
      }),
    );

    const styleSuggestions: SuggestionInput[] = styleFindings.map(
      (finding) => ({
        type: 'style',
        title: finding.title,
        detail: finding.detail,
        payload: finding.payload as unknown as Prisma.InputJsonValue,
      }),
    );

    const allSuggestions = [
      ...overuseSuggestions,
      ...grammarSuggestions,
      ...styleSuggestions,
    ];
    const now = new Date();

    const fingerprints = allSuggestions.map((s) =>
      fingerprintOf({
        type: s.type,
        title: s.title,
        payload: s.payload as Record<string, unknown>,
      }),
    );
    const countsByType: Record<ChatSuggestionType, number> = {
      overused_word: overuseSuggestions.length,
      grammar: grammarSuggestions.length,
      style: styleSuggestions.length,
    };

    await this.prisma.$transaction([
      this.prisma.chatSuggestion.deleteMany({ where: { conversationId } }),
      this.prisma.chatSuggestion.createMany({
        data: allSuggestions.map((s) => ({
          conversationId,
          type: s.type,
          title: s.title,
          detail: s.detail,
          payload: s.payload,
        })),
      }),
      this.prisma.chatAnalysisSnapshot.create({
        data: {
          conversationId,
          userMessageCount: userMessages.length,
          fingerprints,
          countsByType,
        },
      }),
      this.prisma.chatConversation.update({
        where: { id: conversationId },
        data: { analyzedAt: now },
      }),
    ]);

    this.logger.log({
      message: 'conversation analyzed',
      event: 'chat.conversation_analyzed',
      method: this.analyzeConversation.name,
      data: {
        conversationId,
        overuseCount: overuseSuggestions.length,
        grammarCount: grammarSuggestions.length,
        styleCount: styleSuggestions.length,
      },
    });
  }

  private async findSynonyms(word: string): Promise<string[]> {
    const wordRow = await this.wordsService.findByLemma(word, SYNONYM_LANGUAGE);
    if (wordRow === null) return [];

    const definitions = await this.definitionService.findByWordId(wordRow.id);
    const synonyms = new Set<string>();

    for (const definition of definitions) {
      if (synonyms.size >= MAX_SYNONYMS) break;
      const answers =
        await this.synonymsService.findSynonymAnswersForDefinition(
          definition.id,
        );
      for (const answer of answers) {
        if (synonyms.size >= MAX_SYNONYMS) break;
        if (answer.lemma !== word) synonyms.add(answer.lemma);
      }
    }

    return [...synonyms].slice(0, MAX_SYNONYMS);
  }
}
