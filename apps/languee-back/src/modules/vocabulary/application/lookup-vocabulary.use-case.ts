import { Injectable } from '@nestjs/common';
import { LookupWordUseCase } from '../../dictionary/application/lookup-word.use-case';
import { CardsPrismaService } from '../../cards/cards.prisma.service';
import {
  DeckRef,
  EnrichedDefinitionResult,
  LookupVocabularyInput,
  LookupVocabularyOutput,
} from '../types/lookup-vocabulary.types';

@Injectable()
export class LookupVocabularyUseCase {
  constructor(
    private readonly lookupWordUseCase: LookupWordUseCase,
    private readonly cardsPrismaService: CardsPrismaService,
  ) {}

  async execute(input: LookupVocabularyInput): Promise<LookupVocabularyOutput> {
    const baseOutput = await this.lookupWordUseCase.execute({
      word: input.word,
      language: input.language,
    });

    const definitionIds = baseOutput.definitions.map((d) => d.id);

    const cards =
      await this.cardsPrismaService.findCardsByDefinitionIdsAndUserId(
        definitionIds,
        input.userId,
      );

    const decksByDefinition = new Map<string, DeckRef[]>();
    for (const card of cards) {
      const existing = decksByDefinition.get(card.definitionId) ?? [];
      existing.push({ id: card.deck.id, name: card.deck.name });
      decksByDefinition.set(card.definitionId, existing);
    }

    const definitions: EnrichedDefinitionResult[] = baseOutput.definitions.map(
      (def) => ({
        id: def.id,
        partOfSpeech: def.part_of_speech,
        definition: def.definition,
        example: def.example,
        provider: def.provider,
        decks: decksByDefinition.get(def.id) ?? [],
      }),
    );

    return {
      lemma: baseOutput.lemma,
      source: baseOutput.source,
      definitions,
    };
  }
}
