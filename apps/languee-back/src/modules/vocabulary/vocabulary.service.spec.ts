import { Test, TestingModule } from '@nestjs/testing';
import { VocabularyService } from './vocabulary.service';
import { DictionaryService } from '../dictionary/dictionary.service';
import { CardsService } from '../cards/cards.service';
import { NlpService } from '../nlp/nlp.service';
import { DefinitionsNotFoundException } from '../dictionary/dictionary.errors';
import { NlpMultiWordError, NlpUnavailableError } from '../nlp/nlp.errors';
import type { NlpAnalysis } from '../nlp/nlp.interfaces';
import { PartOfSpeech } from './enums/part-of-speech.enum';

const mockDictionaryService = {
  lookup: jest.fn(),
};

const mockCardsService = {
  findCardsByDefinitionIdsAndUserId: jest.fn(),
};

const mockNlpService = {
  analyzeWord: jest.fn(),
};

const defaultNlpAnalysis: NlpAnalysis = {
  lemma: 'run',
  pos: PartOfSpeech.VERB,
  isIrregular: true,
  inflectionForms: { base: 'run', past: 'ran', pastParticiple: 'run' },
};

const baseDefinition = {
  id: 'def-id-1',
  part_of_speech: PartOfSpeech.VERB,
  definition: 'to move fast',
  example: 'She ran quickly.',
  provider: 'free-dictionary',
  hasIrregularForms: true,
  inflectionForms: { base: 'run', past: 'ran', pastParticiple: 'run' },
};

const baseOutput = {
  lemma: 'run',
  source: 'cache' as const,
  definitions: [baseDefinition],
};

describe('VocabularyService', () => {
  let service: VocabularyService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockNlpService.analyzeWord.mockResolvedValue(defaultNlpAnalysis);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VocabularyService,
        { provide: DictionaryService, useValue: mockDictionaryService },
        { provide: CardsService, useValue: mockCardsService },
        { provide: NlpService, useValue: mockNlpService },
      ],
    }).compile();

    service = module.get<VocabularyService>(VocabularyService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('lookup()', () => {
    it('happy path — cache hit, user has cards for definitions, decks array is populated', async () => {
      mockDictionaryService.lookup.mockResolvedValue({
        ...baseOutput,
        source: 'cache',
      });
      mockCardsService.findCardsByDefinitionIdsAndUserId.mockResolvedValue([
        {
          definitionId: 'def-id-1',
          deck: { id: 'deck-id-1', name: 'My Deck' },
        },
      ]);

      const result = await service.lookup({
        word: 'run',
        language: 'en',
        userId: 'user-id-1',
      });

      expect(result.input).toBe('run');
      expect(result.lemma).toBe('run');
      expect(result.definitions[0].decks).toHaveLength(1);
      expect(result.definitions[0].decks[0]).toEqual({
        id: 'deck-id-1',
        name: 'My Deck',
      });
    });

    it('happy path — provider fetch, deck enrichment still applied', async () => {
      mockDictionaryService.lookup.mockResolvedValue({
        ...baseOutput,
        source: 'provider',
      });
      mockCardsService.findCardsByDefinitionIdsAndUserId.mockResolvedValue([
        {
          definitionId: 'def-id-1',
          deck: { id: 'deck-id-1', name: 'My Deck' },
        },
      ]);

      const result = await service.lookup({
        word: 'run',
        language: 'en',
        userId: 'user-id-1',
      });

      expect(result.definitions[0].decks).toHaveLength(1);
    });

    it('edge case — definition without matching card has empty decks array', async () => {
      mockDictionaryService.lookup.mockResolvedValue({
        ...baseOutput,
        definitions: [
          baseDefinition,
          {
            id: 'def-id-2',
            part_of_speech: PartOfSpeech.VERB,
            definition: 'a run',
            example: null,
            provider: 'free-dictionary',
            hasIrregularForms: false,
            inflectionForms: null,
          },
        ],
      });
      mockCardsService.findCardsByDefinitionIdsAndUserId.mockResolvedValue([
        {
          definitionId: 'def-id-1',
          deck: { id: 'deck-id-1', name: 'My Deck' },
        },
      ]);

      const result = await service.lookup({
        word: 'run',
        language: 'en',
        userId: 'user-id-1',
      });

      expect(result.definitions[0].decks).toHaveLength(1);
      expect(result.definitions[1].decks).toEqual([]);
    });

    it('edge case — user has no cards at all, all definitions return empty decks arrays', async () => {
      mockDictionaryService.lookup.mockResolvedValue(baseOutput);
      mockCardsService.findCardsByDefinitionIdsAndUserId.mockResolvedValue([]);

      const result = await service.lookup({
        word: 'run',
        language: 'en',
        userId: 'user-id-1',
      });

      expect(result.definitions[0].decks).toEqual([]);
    });

    it('edge case — cards from another user do not appear (query scoped by userId)', async () => {
      mockDictionaryService.lookup.mockResolvedValue(baseOutput);
      mockCardsService.findCardsByDefinitionIdsAndUserId.mockResolvedValue([]);

      await service.lookup({
        word: 'run',
        language: 'en',
        userId: 'user-id-1',
      });

      expect(
        mockCardsService.findCardsByDefinitionIdsAndUserId,
      ).toHaveBeenCalledWith(['def-id-1'], 'user-id-1');
    });

    it('edge case — same definition in two decks shows both decks', async () => {
      mockDictionaryService.lookup.mockResolvedValue(baseOutput);
      mockCardsService.findCardsByDefinitionIdsAndUserId.mockResolvedValue([
        { definitionId: 'def-id-1', deck: { id: 'deck-id-1', name: 'Deck A' } },
        { definitionId: 'def-id-1', deck: { id: 'deck-id-2', name: 'Deck B' } },
      ]);

      const result = await service.lookup({
        word: 'run',
        language: 'en',
        userId: 'user-id-1',
      });

      expect(result.definitions[0].decks).toHaveLength(2);
      expect(result.definitions[0].decks).toContainEqual({
        id: 'deck-id-1',
        name: 'Deck A',
      });
      expect(result.definitions[0].decks).toContainEqual({
        id: 'deck-id-2',
        name: 'Deck B',
      });
    });

    it('edge case — word not found throws DefinitionsNotFoundException (propagated from DictionaryService)', async () => {
      mockDictionaryService.lookup.mockRejectedValue(
        new DefinitionsNotFoundException('xyzabc', 'en'),
      );

      await expect(
        service.lookup({ word: 'xyzabc', language: 'en', userId: 'user-id-1' }),
      ).rejects.toBeInstanceOf(DefinitionsNotFoundException);

      expect(
        mockCardsService.findCardsByDefinitionIdsAndUserId,
      ).not.toHaveBeenCalled();
    });

    it('maps part_of_speech (snake_case) to partOfSpeech (camelCase) in the output', async () => {
      mockDictionaryService.lookup.mockResolvedValue(baseOutput);
      mockCardsService.findCardsByDefinitionIdsAndUserId.mockResolvedValue([]);

      const result = await service.lookup({
        word: 'run',
        language: 'en',
        userId: 'user-id-1',
      });

      expect(result.definitions[0].partOfSpeech).toBe(PartOfSpeech.VERB);
      expect(result.definitions[0]).not.toHaveProperty('part_of_speech');
    });

    // -------------------------------------------------------------------------
    // POS filtering tests
    // -------------------------------------------------------------------------

    it('POS filtering — only verb definitions returned when NLP maps to VERB', async () => {
      const verbDef = {
        id: 'def-id-1',
        part_of_speech: PartOfSpeech.VERB,
        definition: 'to move fast',
        example: null,
        provider: 'free-dictionary',
        hasIrregularForms: true,
        inflectionForms: null,
      };
      const nounDef = {
        id: 'def-id-2',
        part_of_speech: PartOfSpeech.NOUN,
        definition: 'a run',
        example: null,
        provider: 'free-dictionary',
        hasIrregularForms: false,
        inflectionForms: null,
      };
      mockDictionaryService.lookup.mockResolvedValue({
        lemma: 'run',
        source: 'cache',
        definitions: [verbDef, nounDef],
      });
      mockCardsService.findCardsByDefinitionIdsAndUserId.mockResolvedValue([]);

      const result = await service.lookup({
        word: 'run',
        language: 'en',
        userId: 'user-id-1',
      });

      expect(result.definitions).toHaveLength(1);
      expect(result.definitions[0].partOfSpeech).toBe(PartOfSpeech.VERB);
      expect(result.meta.filteredByPos).toBe(true);
      expect(result.meta.unmatchedPos).toBe(false);
      expect(result.meta.availablePartsOfSpeech).toContain(PartOfSpeech.VERB);
      expect(result.meta.availablePartsOfSpeech).toContain(PartOfSpeech.NOUN);
    });

    it('POS filtering — unmatchedPos is true when no definitions match the resolved POS', async () => {
      const nounDef = {
        id: 'def-id-1',
        part_of_speech: PartOfSpeech.NOUN,
        definition: 'a run',
        example: null,
        provider: 'free-dictionary',
        hasIrregularForms: false,
        inflectionForms: null,
      };
      mockDictionaryService.lookup.mockResolvedValue({
        lemma: 'run',
        source: 'cache',
        definitions: [nounDef],
      });
      mockCardsService.findCardsByDefinitionIdsAndUserId.mockResolvedValue([]);

      // NLP returns VERB but dictionary only has noun
      const result = await service.lookup({
        word: 'run',
        language: 'en',
        userId: 'user-id-1',
      });

      expect(result.definitions).toHaveLength(0);
      expect(result.meta.filteredByPos).toBe(true);
      expect(result.meta.unmatchedPos).toBe(true);
    });

    it('POS filtering — all definitions returned when NLP pos is null', async () => {
      const nullPosNlp: NlpAnalysis = {
        lemma: 'run',
        pos: null,
        isIrregular: false,
        inflectionForms: {},
      };
      mockNlpService.analyzeWord.mockResolvedValue(nullPosNlp);
      const verbDef = {
        id: 'def-id-1',
        part_of_speech: PartOfSpeech.VERB,
        definition: 'to move fast',
        example: null,
        provider: 'free-dictionary',
        hasIrregularForms: false,
        inflectionForms: null,
      };
      const nounDef = {
        id: 'def-id-2',
        part_of_speech: PartOfSpeech.NOUN,
        definition: 'a run',
        example: null,
        provider: 'free-dictionary',
        hasIrregularForms: false,
        inflectionForms: null,
      };
      mockDictionaryService.lookup.mockResolvedValue({
        lemma: 'run',
        source: 'cache',
        definitions: [verbDef, nounDef],
      });
      mockCardsService.findCardsByDefinitionIdsAndUserId.mockResolvedValue([]);

      const result = await service.lookup({
        word: 'run',
        language: 'en',
        userId: 'user-id-1',
      });

      expect(result.definitions).toHaveLength(2);
      expect(result.meta.filteredByPos).toBe(false);
      expect(result.meta.unmatchedPos).toBe(false);
    });

    it('meta.availablePartsOfSpeech has no duplicates', async () => {
      mockDictionaryService.lookup.mockResolvedValue({
        lemma: 'run',
        source: 'cache',
        definitions: [
          {
            id: 'def-id-1',
            part_of_speech: PartOfSpeech.VERB,
            definition: 'move fast',
            example: null,
            provider: 'free-dictionary',
            hasIrregularForms: false,
            inflectionForms: null,
          },
          {
            id: 'def-id-2',
            part_of_speech: PartOfSpeech.VERB,
            definition: 'operate',
            example: null,
            provider: 'free-dictionary',
            hasIrregularForms: false,
            inflectionForms: null,
          },
        ],
      });
      mockCardsService.findCardsByDefinitionIdsAndUserId.mockResolvedValue([]);

      const result = await service.lookup({
        word: 'run',
        language: 'en',
        userId: 'user-id-1',
      });

      const verbCount = result.meta.availablePartsOfSpeech.filter(
        (p) => p === PartOfSpeech.VERB,
      ).length;
      expect(verbCount).toBe(1);
    });

    it('deck enrichment runs on the filtered definitions set only', async () => {
      const verbDef = {
        id: 'def-id-1',
        part_of_speech: PartOfSpeech.VERB,
        definition: 'to move fast',
        example: null,
        provider: 'free-dictionary',
        hasIrregularForms: false,
        inflectionForms: null,
      };
      const nounDef = {
        id: 'def-id-2',
        part_of_speech: PartOfSpeech.NOUN,
        definition: 'a run',
        example: null,
        provider: 'free-dictionary',
        hasIrregularForms: false,
        inflectionForms: null,
      };
      mockDictionaryService.lookup.mockResolvedValue({
        lemma: 'run',
        source: 'cache',
        definitions: [verbDef, nounDef],
      });
      mockCardsService.findCardsByDefinitionIdsAndUserId.mockResolvedValue([]);

      await service.lookup({
        word: 'run',
        language: 'en',
        userId: 'user-id-1',
      });

      // Only the verb def id should be passed (noun filtered out by POS=VERB)
      expect(
        mockCardsService.findCardsByDefinitionIdsAndUserId,
      ).toHaveBeenCalledWith(['def-id-1'], 'user-id-1');
    });

    it('POS filtering — only adjective definitions returned when NLP maps to ADJ', async () => {
      const adjNlp: NlpAnalysis = {
        lemma: 'fast',
        pos: PartOfSpeech.ADJECTIVE,
        isIrregular: false,
        inflectionForms: {},
      };
      mockNlpService.analyzeWord.mockResolvedValue(adjNlp);
      const adjDef = {
        id: 'def-id-1',
        part_of_speech: PartOfSpeech.ADJECTIVE,
        definition: 'moving quickly',
        example: null,
        provider: 'free-dictionary',
        hasIrregularForms: false,
        inflectionForms: null,
      };
      const verbDef = {
        id: 'def-id-2',
        part_of_speech: PartOfSpeech.VERB,
        definition: 'to fast (refrain from eating)',
        example: null,
        provider: 'free-dictionary',
        hasIrregularForms: false,
        inflectionForms: null,
      };
      mockDictionaryService.lookup.mockResolvedValue({
        lemma: 'fast',
        source: 'cache',
        definitions: [adjDef, verbDef],
      });
      mockCardsService.findCardsByDefinitionIdsAndUserId.mockResolvedValue([]);

      const result = await service.lookup({
        word: 'fast',
        language: 'en',
        userId: 'user-id-1',
      });

      expect(result.definitions).toHaveLength(1);
      expect(result.definitions[0].partOfSpeech).toBe(PartOfSpeech.ADJECTIVE);
      expect(result.meta.filteredByPos).toBe(true);
      expect(result.meta.unmatchedPos).toBe(false);
    });

    it('meta.unmatchedPos is false when filteredByPos is false', async () => {
      const nullPosNlp: NlpAnalysis = {
        lemma: 'run',
        pos: null,
        isIrregular: false,
        inflectionForms: {},
      };
      mockNlpService.analyzeWord.mockResolvedValue(nullPosNlp);
      mockDictionaryService.lookup.mockResolvedValue(baseOutput);
      mockCardsService.findCardsByDefinitionIdsAndUserId.mockResolvedValue([]);

      const result = await service.lookup({
        word: 'run',
        language: 'en',
        userId: 'user-id-1',
      });

      expect(result.meta.filteredByPos).toBe(false);
      expect(result.meta.unmatchedPos).toBe(false);
    });

    it('meta.availablePartsOfSpeech reflects the full pre-filter set when unmatchedPos is true', async () => {
      const nounDef = {
        id: 'def-id-1',
        part_of_speech: PartOfSpeech.NOUN,
        definition: 'a run',
        example: null,
        provider: 'free-dictionary',
        hasIrregularForms: false,
        inflectionForms: null,
      };
      // NLP returns VERB but dictionary only has noun
      mockDictionaryService.lookup.mockResolvedValue({
        lemma: 'run',
        source: 'cache',
        definitions: [nounDef],
      });
      mockCardsService.findCardsByDefinitionIdsAndUserId.mockResolvedValue([]);

      const result = await service.lookup({
        word: 'run',
        language: 'en',
        userId: 'user-id-1',
      });

      expect(result.meta.unmatchedPos).toBe(true);
      expect(result.meta.availablePartsOfSpeech).toEqual([PartOfSpeech.NOUN]);
    });

    it('context field is optional — omitting it does not affect lookup behaviour', async () => {
      mockDictionaryService.lookup.mockResolvedValue(baseOutput);
      mockCardsService.findCardsByDefinitionIdsAndUserId.mockResolvedValue([]);

      const result = await service.lookup({
        word: 'run',
        language: 'en',
        userId: 'user-id-1',
        // no context field
      });

      expect(result.definitions).toHaveLength(1);
      expect(result.context).toBeUndefined();
    });

    it('context field is preserved in the output when provided', async () => {
      mockDictionaryService.lookup.mockResolvedValue(baseOutput);
      mockCardsService.findCardsByDefinitionIdsAndUserId.mockResolvedValue([]);

      const result = await service.lookup({
        word: 'run',
        language: 'en',
        userId: 'user-id-1',
        context: 'She runs every morning.',
      });

      expect(result.context).toBe('She runs every morning.');
    });

    // -------------------------------------------------------------------------
    // NLP integration tests
    // -------------------------------------------------------------------------

    it('NLP analyzeWord() is called with input.word before dictionary lookup', async () => {
      mockDictionaryService.lookup.mockResolvedValue(baseOutput);
      mockCardsService.findCardsByDefinitionIdsAndUserId.mockResolvedValue([]);

      await service.lookup({
        word: 'walked',
        language: 'en',
        userId: 'user-id-1',
      });

      expect(mockNlpService.analyzeWord).toHaveBeenCalledWith('walked');
    });

    it('dictionaryService.lookup() is called with NLP lemma, pos, and inflection data', async () => {
      const nlpResult: NlpAnalysis = {
        lemma: 'walk',
        pos: PartOfSpeech.VERB,
        isIrregular: false,
        inflectionForms: { base: 'walk', past: 'walked' },
      };
      mockNlpService.analyzeWord.mockResolvedValue(nlpResult);
      mockDictionaryService.lookup.mockResolvedValue(baseOutput);
      mockCardsService.findCardsByDefinitionIdsAndUserId.mockResolvedValue([]);

      await service.lookup({
        word: 'walked',
        language: 'en',
        userId: 'user-id-1',
      });

      expect(mockDictionaryService.lookup).toHaveBeenCalledWith(
        expect.objectContaining({
          word: 'walked',
          lemma: 'walk',
          pos: PartOfSpeech.VERB,
          isIrregular: false,
          inflectionForms: { base: 'walk', past: 'walked' },
        }),
      );
    });

    it('NlpService throws NlpUnavailableError — propagates from service without calling dictionaryService', async () => {
      mockNlpService.analyzeWord.mockRejectedValue(new NlpUnavailableError());

      await expect(
        service.lookup({ word: 'walk', language: 'en', userId: 'user-id-1' }),
      ).rejects.toBeInstanceOf(NlpUnavailableError);

      expect(mockDictionaryService.lookup).not.toHaveBeenCalled();
    });

    it('NlpService throws NlpMultiWordError — propagates from service without calling dictionaryService', async () => {
      mockNlpService.analyzeWord.mockRejectedValue(new NlpMultiWordError());

      await expect(
        service.lookup({
          word: 'walk fast',
          language: 'en',
          userId: 'user-id-1',
        }),
      ).rejects.toBeInstanceOf(NlpMultiWordError);

      expect(mockDictionaryService.lookup).not.toHaveBeenCalled();
    });
  });
});
