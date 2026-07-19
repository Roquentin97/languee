import { Test, TestingModule } from '@nestjs/testing';
import { LexicalKind } from '@prisma/client';
import { VocabularyService } from './vocabulary.service';
import { DictionaryService } from '../dictionary/dictionary.service';
import { CardsService } from '../cards/cards.service';
import { NlpService } from '../nlp/nlp.service';
import { WordsService } from '../words/words.service';
import { DefinitionService } from '../definitions/definitions.service';
import { DefinitionsNotFoundException } from '../dictionary/dictionary.errors';
import { DefinitionAlreadyExistsError } from '../definitions/definitions.errors';
import { NlpInputInvalidError, NlpUnavailableError } from '../nlp/nlp.errors';
import type {
  NlpExpressionAnalysis,
  NlpWordAnalysis,
} from '../nlp/nlp.interfaces';
import { PartOfSpeech } from './enums/part-of-speech.enum';
import {
  PartOfSpeechRequiredError,
  TextMustBeExpressionError,
  TextMustBeSingleWordError,
} from './vocabulary.errors';

const mockDictionaryService = {
  lookup: jest.fn(),
};

const mockCardsService = {
  findCardsByDefinitionIdsAndUserId: jest.fn(),
};

const mockNlpService = {
  analyze: jest.fn(),
};

const mockWordsService = {
  canonicalise: jest.fn(),
  ensureExistsAndReturn: jest.fn(),
};

const mockDefinitionService = {
  createOne: jest.fn(),
};

const defaultNlpAnalysis: NlpWordAnalysis = {
  kind: 'word',
  lemma: 'run',
  pos: PartOfSpeech.VERB,
  isIrregular: true,
  inflectionForms: {
    type: 'verb' as const,
    base: 'run',
    past: 'ran',
    pastParticiple: 'run',
  },
  extraForms: null,
};

const baseDefinition = {
  id: 'def-id-1',
  partOfSpeech: PartOfSpeech.VERB,
  definition: 'to move fast',
  example: 'She ran quickly.',
  provider: 'free-dictionary',
  hasIrregularForms: true,
  inflectionForms: {
    type: 'verb' as const,
    base: 'run',
    past: 'ran',
    pastParticiple: 'run',
  },
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
    mockNlpService.analyze.mockResolvedValue(defaultNlpAnalysis);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VocabularyService,
        { provide: DictionaryService, useValue: mockDictionaryService },
        { provide: CardsService, useValue: mockCardsService },
        { provide: NlpService, useValue: mockNlpService },
        { provide: WordsService, useValue: mockWordsService },
        { provide: DefinitionService, useValue: mockDefinitionService },
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
            partOfSpeech: PartOfSpeech.VERB,
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

    it('returns definitions with camelCase partOfSpeech in the output', async () => {
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
        partOfSpeech: PartOfSpeech.VERB,
        definition: 'to move fast',
        example: null,
        provider: 'free-dictionary',
        hasIrregularForms: true,
        inflectionForms: null,
      };
      const nounDef = {
        id: 'def-id-2',
        partOfSpeech: PartOfSpeech.NOUN,
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
        context: 'She runs every morning.',
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
        partOfSpeech: PartOfSpeech.NOUN,
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
        context: 'She runs every morning.',
      });

      expect(result.definitions).toHaveLength(0);
      expect(result.meta.filteredByPos).toBe(true);
      expect(result.meta.unmatchedPos).toBe(true);
    });

    it('POS filtering — all definitions returned when NLP pos is null', async () => {
      const nullPosNlp: NlpWordAnalysis = {
        kind: 'word',
        lemma: 'run',
        pos: null,
        isIrregular: false,
        inflectionForms: null,
        extraForms: null,
      };
      mockNlpService.analyze.mockResolvedValue(nullPosNlp);
      const verbDef = {
        id: 'def-id-1',
        partOfSpeech: PartOfSpeech.VERB,
        definition: 'to move fast',
        example: null,
        provider: 'free-dictionary',
        hasIrregularForms: false,
        inflectionForms: null,
      };
      const nounDef = {
        id: 'def-id-2',
        partOfSpeech: PartOfSpeech.NOUN,
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
            partOfSpeech: PartOfSpeech.VERB,
            definition: 'move fast',
            example: null,
            provider: 'free-dictionary',
            hasIrregularForms: false,
            inflectionForms: null,
          },
          {
            id: 'def-id-2',
            partOfSpeech: PartOfSpeech.VERB,
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
        partOfSpeech: PartOfSpeech.VERB,
        definition: 'to move fast',
        example: null,
        provider: 'free-dictionary',
        hasIrregularForms: false,
        inflectionForms: null,
      };
      const nounDef = {
        id: 'def-id-2',
        partOfSpeech: PartOfSpeech.NOUN,
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
        context: 'She runs every morning.',
      });

      // Only the verb def id should be passed (noun filtered out by POS=VERB)
      expect(
        mockCardsService.findCardsByDefinitionIdsAndUserId,
      ).toHaveBeenCalledWith(['def-id-1'], 'user-id-1');
    });

    it('POS filtering — only adjective definitions returned when NLP maps to ADJ', async () => {
      const adjNlp: NlpWordAnalysis = {
        kind: 'word',
        lemma: 'fast',
        pos: PartOfSpeech.ADJECTIVE,
        isIrregular: false,
        inflectionForms: null,
        extraForms: null,
      };
      mockNlpService.analyze.mockResolvedValue(adjNlp);
      const adjDef = {
        id: 'def-id-1',
        partOfSpeech: PartOfSpeech.ADJECTIVE,
        definition: 'moving quickly',
        example: null,
        provider: 'free-dictionary',
        hasIrregularForms: false,
        inflectionForms: null,
      };
      const verbDef = {
        id: 'def-id-2',
        partOfSpeech: PartOfSpeech.VERB,
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
        context: 'That was a fast train.',
      });

      expect(result.definitions).toHaveLength(1);
      expect(result.definitions[0].partOfSpeech).toBe(PartOfSpeech.ADJECTIVE);
      expect(result.meta.filteredByPos).toBe(true);
      expect(result.meta.unmatchedPos).toBe(false);
    });

    it('meta.unmatchedPos is false when filteredByPos is false', async () => {
      const nullPosNlp: NlpWordAnalysis = {
        kind: 'word',
        lemma: 'run',
        pos: null,
        isIrregular: false,
        inflectionForms: null,
        extraForms: null,
      };
      mockNlpService.analyze.mockResolvedValue(nullPosNlp);
      mockDictionaryService.lookup.mockResolvedValue(baseOutput);
      mockCardsService.findCardsByDefinitionIdsAndUserId.mockResolvedValue([]);

      const result = await service.lookup({
        word: 'run',
        language: 'en',
        userId: 'user-id-1',
        context: 'She runs every morning.',
      });

      expect(result.meta.filteredByPos).toBe(false);
      expect(result.meta.unmatchedPos).toBe(false);
    });

    it('meta.availablePartsOfSpeech reflects the full pre-filter set when unmatchedPos is true', async () => {
      const nounDef = {
        id: 'def-id-1',
        partOfSpeech: PartOfSpeech.NOUN,
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
        context: 'She runs every morning.',
      });

      expect(result.meta.unmatchedPos).toBe(true);
      expect(result.meta.availablePartsOfSpeech).toEqual([PartOfSpeech.NOUN]);
    });

    it('POS filtering — all definitions returned when context is omitted', async () => {
      const verbDef = {
        id: 'def-id-1',
        partOfSpeech: PartOfSpeech.VERB,
        definition: 'to move fast',
        example: null,
        provider: 'free-dictionary',
        hasIrregularForms: false,
        inflectionForms: null,
      };
      const nounDef = {
        id: 'def-id-2',
        partOfSpeech: PartOfSpeech.NOUN,
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
        // no context field
      });

      expect(result.definitions).toHaveLength(2);
      expect(result.context).toBeUndefined();
      expect(result.meta.filteredByPos).toBe(false);
      expect(result.meta.unmatchedPos).toBe(false);
    });

    it('POS filtering — all definitions returned when disablePosFiltering is true', async () => {
      const verbDef = {
        id: 'def-id-1',
        partOfSpeech: PartOfSpeech.VERB,
        definition: 'to move fast',
        example: null,
        provider: 'free-dictionary',
        hasIrregularForms: false,
        inflectionForms: null,
      };
      const nounDef = {
        id: 'def-id-2',
        partOfSpeech: PartOfSpeech.NOUN,
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
        context: 'She runs every morning.',
        disablePosFiltering: true,
      });

      expect(result.definitions).toHaveLength(2);
      expect(result.meta.filteredByPos).toBe(false);
      expect(result.meta.unmatchedPos).toBe(false);
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

    it('NLP analyze() is called with input.word before dictionary lookup', async () => {
      mockDictionaryService.lookup.mockResolvedValue(baseOutput);
      mockCardsService.findCardsByDefinitionIdsAndUserId.mockResolvedValue([]);

      await service.lookup({
        word: 'walked',
        language: 'en',
        userId: 'user-id-1',
      });

      expect(mockNlpService.analyze).toHaveBeenCalledWith(
        'walked',
        undefined,
        'en',
      );
    });

    it('passes optional context to NLP analyze()', async () => {
      mockDictionaryService.lookup.mockResolvedValue(baseOutput);
      mockCardsService.findCardsByDefinitionIdsAndUserId.mockResolvedValue([]);

      await service.lookup({
        word: 'saw',
        language: 'en',
        userId: 'user-id-1',
        context: 'The saw was sharp enough to cut oak.',
      });

      expect(mockNlpService.analyze).toHaveBeenCalledWith(
        'saw',
        'The saw was sharp enough to cut oak.',
        'en',
      );
    });

    it('dictionaryService.lookup() is called with NLP lemma, pos, and inflection data', async () => {
      const nlpResult: NlpWordAnalysis = {
        kind: 'word',
        lemma: 'walk',
        pos: PartOfSpeech.VERB,
        isIrregular: false,
        inflectionForms: {
          type: 'verb' as const,
          base: 'walk',
          past: 'walked',
        },
        extraForms: null,
      };
      mockNlpService.analyze.mockResolvedValue(nlpResult);
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
          inflectionForms: {
            type: 'verb' as const,
            base: 'walk',
            past: 'walked',
          },
        }),
      );
    });

    it('NlpService throws NlpUnavailableError — propagates from service without calling dictionaryService', async () => {
      mockNlpService.analyze.mockRejectedValue(new NlpUnavailableError());

      await expect(
        service.lookup({ word: 'walk', language: 'en', userId: 'user-id-1' }),
      ).rejects.toBeInstanceOf(NlpUnavailableError);

      expect(mockDictionaryService.lookup).not.toHaveBeenCalled();
    });

    it('NlpService throws NlpInputInvalidError — propagates from service without calling dictionaryService (NLP rejected the input)', async () => {
      mockNlpService.analyze.mockRejectedValue(new NlpInputInvalidError());

      await expect(
        service.lookup({
          word: "don't",
          language: 'en',
          userId: 'user-id-1',
        }),
      ).rejects.toBeInstanceOf(NlpInputInvalidError);

      expect(mockDictionaryService.lookup).not.toHaveBeenCalled();
    });

    // -------------------------------------------------------------------------
    // Non-English languages — extraForms-derived inflectionForms + language echo
    // -------------------------------------------------------------------------

    describe('lookup() — non-English extraForms and language echo', () => {
      it('es lookup builds {type: "es", ...extraForms} inflectionForms and passes language through to NLP and dictionary', async () => {
        mockNlpService.analyze.mockResolvedValue({
          kind: 'word',
          lemma: 'correr',
          pos: PartOfSpeech.VERB,
          isIrregular: false,
          inflectionForms: null,
          extraForms: {
            indicative_present_yo: 'corro',
            indicative_preterite_yo: 'corrí',
          },
        });
        mockDictionaryService.lookup.mockResolvedValue(baseOutput);
        mockCardsService.findCardsByDefinitionIdsAndUserId.mockResolvedValue(
          [],
        );

        const result = await service.lookup({
          word: 'corro',
          language: 'es',
          userId: 'user-id-1',
        });

        expect(mockNlpService.analyze).toHaveBeenCalledWith(
          'corro',
          undefined,
          'es',
        );
        expect(mockDictionaryService.lookup).toHaveBeenCalledWith(
          expect.objectContaining({
            language: 'es',
            inflectionForms: {
              type: 'es',
              indicative_present_yo: 'corro',
              indicative_preterite_yo: 'corrí',
            },
          }),
        );
        expect(result.language).toBe('es');
      });

      it('de lookup builds {type: "de", ...extraForms} inflectionForms and passes language through to NLP and dictionary', async () => {
        mockNlpService.analyze.mockResolvedValue({
          kind: 'word',
          lemma: 'laufen',
          pos: PartOfSpeech.VERB,
          isIrregular: true,
          inflectionForms: null,
          extraForms: {
            present_ich: 'laufe',
            present_du: 'läufst',
            partizip_ii: 'gelaufen',
          },
        });
        mockDictionaryService.lookup.mockResolvedValue(baseOutput);
        mockCardsService.findCardsByDefinitionIdsAndUserId.mockResolvedValue(
          [],
        );

        const result = await service.lookup({
          word: 'laufe',
          language: 'de',
          userId: 'user-id-1',
        });

        expect(mockNlpService.analyze).toHaveBeenCalledWith(
          'laufe',
          undefined,
          'de',
        );
        expect(mockDictionaryService.lookup).toHaveBeenCalledWith(
          expect.objectContaining({
            language: 'de',
            inflectionForms: {
              type: 'de',
              present_ich: 'laufe',
              present_du: 'läufst',
              partizip_ii: 'gelaufen',
            },
          }),
        );
        expect(result.language).toBe('de');
      });

      it('en lookup regression — inflectionForms still comes from the lemminflect-derived shape, not extraForms', async () => {
        mockDictionaryService.lookup.mockResolvedValue(baseOutput);
        mockCardsService.findCardsByDefinitionIdsAndUserId.mockResolvedValue(
          [],
        );

        const result = await service.lookup({
          word: 'run',
          language: 'en',
          userId: 'user-id-1',
        });

        expect(mockDictionaryService.lookup).toHaveBeenCalledWith(
          expect.objectContaining({
            language: 'en',
            inflectionForms: defaultNlpAnalysis.inflectionForms,
          }),
        );
        expect(result.language).toBe('en');
      });
    });

    // -------------------------------------------------------------------------
    // Expression-aware lookup (2-6 tokens)
    // -------------------------------------------------------------------------

    const defaultExpressionAnalysis: NlpExpressionAnalysis = {
      canonical: 'run into',
      kind: 'phrasal_verb',
      headLemma: 'run',
      contextMatch: null,
    };

    const expressionDefinition = {
      id: 'def-expr-1',
      partOfSpeech: PartOfSpeech.VERB,
      definition: 'to encounter unexpectedly',
      example: null,
      provider: 'free-dictionary',
      hasIrregularForms: false,
      inflectionForms: null,
    };

    const expressionBaseOutput = {
      lemma: 'run into',
      source: 'cache' as const,
      definitions: [expressionDefinition],
    };

    describe('lookup() — expression path', () => {
      it('single-word path is unaffected — kind="word", isExpression=false, providerMiss=false, expressionContextFound=null', async () => {
        mockDictionaryService.lookup.mockResolvedValue(baseOutput);
        mockCardsService.findCardsByDefinitionIdsAndUserId.mockResolvedValue(
          [],
        );

        const result = await service.lookup({
          word: 'run',
          language: 'en',
          userId: 'user-id-1',
        });

        expect(result.kind).toBe('word');
        expect(result.meta.isExpression).toBe(false);
        expect(result.meta.providerMiss).toBe(false);
        expect(result.meta.expressionContextFound).toBeNull();
        expect(mockNlpService.analyze).toHaveBeenCalledTimes(1);
      });

      it('2-token input calls analyze() and passes canonical lemma + mapped kind to dictionaryService', async () => {
        mockNlpService.analyze.mockResolvedValue(defaultExpressionAnalysis);
        mockDictionaryService.lookup.mockResolvedValue(expressionBaseOutput);
        mockCardsService.findCardsByDefinitionIdsAndUserId.mockResolvedValue(
          [],
        );

        const result = await service.lookup({
          word: 'ran into',
          language: 'en',
          userId: 'user-id-1',
        });

        expect(mockNlpService.analyze).toHaveBeenCalledWith(
          'ran into',
          undefined,
          'en',
        );
        expect(mockDictionaryService.lookup).toHaveBeenCalledWith({
          word: 'ran into',
          lemma: 'run into',
          language: 'en',
          kind: LexicalKind.phrasal_verb,
        });
        expect(result.lemma).toBe('run into');
        expect(result.kind).toBe('phrasal_verb');
        expect(result.partOfSpeech).toBeNull();
        expect(result.meta.isExpression).toBe(true);
      });

      it('NLP kind "expression" maps to LexicalKind.expression for the dictionary lookup', async () => {
        mockNlpService.analyze.mockResolvedValue({
          ...defaultExpressionAnalysis,
          kind: 'expression',
        });
        mockDictionaryService.lookup.mockResolvedValue({
          ...expressionBaseOutput,
          definitions: [],
        });
        mockCardsService.findCardsByDefinitionIdsAndUserId.mockResolvedValue(
          [],
        );

        await service.lookup({
          word: 'kick the bucket',
          language: 'en',
          userId: 'user-id-1',
        });

        expect(mockDictionaryService.lookup).toHaveBeenCalledWith(
          expect.objectContaining({ kind: LexicalKind.expression }),
        );
      });

      it('POS filtering is always bypassed for expressions — filteredByPos false and partOfSpeech null even with mixed POS definitions and context', async () => {
        mockNlpService.analyze.mockResolvedValue(defaultExpressionAnalysis);
        const otherDef = {
          ...expressionDefinition,
          id: 'def-expr-2',
          partOfSpeech: PartOfSpeech.NOUN,
        };
        mockDictionaryService.lookup.mockResolvedValue({
          lemma: 'run into',
          source: 'cache',
          definitions: [expressionDefinition, otherDef],
        });
        mockCardsService.findCardsByDefinitionIdsAndUserId.mockResolvedValue(
          [],
        );

        const result = await service.lookup({
          word: 'ran into',
          language: 'en',
          userId: 'user-id-1',
          context: 'I ran into trouble.',
        });

        expect(result.definitions).toHaveLength(2);
        expect(result.meta.filteredByPos).toBe(false);
        expect(result.partOfSpeech).toBeNull();
      });

      it('providerMiss=true and definitions=[] when dictionaryService throws DefinitionsNotFoundException (expression path only)', async () => {
        mockNlpService.analyze.mockResolvedValue(defaultExpressionAnalysis);
        mockDictionaryService.lookup.mockRejectedValue(
          new DefinitionsNotFoundException('run into', 'en'),
        );
        mockCardsService.findCardsByDefinitionIdsAndUserId.mockResolvedValue(
          [],
        );

        const result = await service.lookup({
          word: 'ran into',
          language: 'en',
          userId: 'user-id-1',
        });

        expect(result.definitions).toEqual([]);
        expect(result.meta.providerMiss).toBe(true);
        expect(result.lemma).toBe('run into');
      });

      it('non-DefinitionsNotFoundException errors from dictionaryService propagate', async () => {
        mockNlpService.analyze.mockResolvedValue(defaultExpressionAnalysis);
        mockDictionaryService.lookup.mockRejectedValue(
          new NlpUnavailableError(),
        );

        await expect(
          service.lookup({
            word: 'ran into',
            language: 'en',
            userId: 'user-id-1',
          }),
        ).rejects.toBeInstanceOf(NlpUnavailableError);
      });

      it('expressionContextFound reflects NLP contextMatch.found when context is provided', async () => {
        mockNlpService.analyze.mockResolvedValue({
          ...defaultExpressionAnalysis,
          contextMatch: {
            found: true,
            matchedText: 'ran into',
            confidence: 'high',
          },
        });
        mockDictionaryService.lookup.mockResolvedValue(expressionBaseOutput);
        mockCardsService.findCardsByDefinitionIdsAndUserId.mockResolvedValue(
          [],
        );

        const result = await service.lookup({
          word: 'ran into',
          language: 'en',
          userId: 'user-id-1',
          context: 'I ran into an old friend.',
        });

        expect(mockNlpService.analyze).toHaveBeenCalledWith(
          'ran into',
          'I ran into an old friend.',
          'en',
        );
        expect(result.meta.expressionContextFound).toBe(true);
      });

      it('populates expression inflectionForms with the matched context form when it differs from canonical', async () => {
        mockNlpService.analyze.mockResolvedValue({
          ...defaultExpressionAnalysis,
          contextMatch: {
            found: true,
            matchedText: 'ran into',
            confidence: 'high',
          },
        });
        mockDictionaryService.lookup.mockResolvedValue(expressionBaseOutput);
        mockCardsService.findCardsByDefinitionIdsAndUserId.mockResolvedValue(
          [],
        );

        const result = await service.lookup({
          word: 'ran into',
          language: 'en',
          userId: 'user-id-1',
          context: 'I ran into an old friend.',
        });

        expect(result.definitions[0].inflectionForms).toEqual({
          type: 'expression',
          contextForm: 'ran into',
        });
      });

      it('leaves expression inflectionForms null when the matched context form equals the canonical form', async () => {
        mockNlpService.analyze.mockResolvedValue({
          ...defaultExpressionAnalysis,
          contextMatch: {
            found: true,
            matchedText: 'run into',
            confidence: 'high',
          },
        });
        mockDictionaryService.lookup.mockResolvedValue(expressionBaseOutput);
        mockCardsService.findCardsByDefinitionIdsAndUserId.mockResolvedValue(
          [],
        );

        const result = await service.lookup({
          word: 'run into',
          language: 'en',
          userId: 'user-id-1',
          context: 'I run into problems daily.',
        });

        expect(result.definitions[0].inflectionForms).toBeNull();
      });

      it('expressionContextFound is null when no context is provided', async () => {
        mockNlpService.analyze.mockResolvedValue(defaultExpressionAnalysis);
        mockDictionaryService.lookup.mockResolvedValue(expressionBaseOutput);
        mockCardsService.findCardsByDefinitionIdsAndUserId.mockResolvedValue(
          [],
        );

        const result = await service.lookup({
          word: 'ran into',
          language: 'en',
          userId: 'user-id-1',
        });

        expect(result.meta.expressionContextFound).toBeNull();
      });

      it('deck enrichment applies to expression definitions', async () => {
        mockNlpService.analyze.mockResolvedValue(defaultExpressionAnalysis);
        mockDictionaryService.lookup.mockResolvedValue(expressionBaseOutput);
        mockCardsService.findCardsByDefinitionIdsAndUserId.mockResolvedValue([
          {
            definitionId: 'def-expr-1',
            deck: { id: 'deck-id-1', name: 'Idioms' },
          },
        ]);

        const result = await service.lookup({
          word: 'ran into',
          language: 'en',
          userId: 'user-id-1',
        });

        expect(result.definitions[0].decks).toEqual([
          { id: 'deck-id-1', name: 'Idioms' },
        ]);
      });

      it('NLP rejects an over-long input via NlpInputInvalidError — propagates without calling dictionaryService (no local token-count check remains)', async () => {
        mockNlpService.analyze.mockRejectedValue(new NlpInputInvalidError());

        await expect(
          service.lookup({
            word: 'one two three four five six seven',
            language: 'en',
            userId: 'user-id-1',
          }),
        ).rejects.toBeInstanceOf(NlpInputInvalidError);

        expect(mockNlpService.analyze).toHaveBeenCalledWith(
          'one two three four five six seven',
          undefined,
          'en',
        );
        expect(mockDictionaryService.lookup).not.toHaveBeenCalled();
      });
    });
  });

  // ---------------------------------------------------------------------------
  // createUserDefinition()
  // ---------------------------------------------------------------------------

  describe('createUserDefinition()', () => {
    beforeEach(() => {
      mockWordsService.canonicalise.mockImplementation((raw: string) =>
        raw.trim().toLowerCase(),
      );
    });

    it('word happy path — canonicalises text, sets kind=word, persists via DefinitionService with provider "user"', async () => {
      mockWordsService.ensureExistsAndReturn.mockResolvedValue({
        id: 'word-id-1',
        lemma: 'run',
        language: 'en',
        kind: LexicalKind.word,
      });
      mockDefinitionService.createOne.mockResolvedValue({
        id: 'def-id-1',
        wordId: 'word-id-1',
        partOfSpeech: 'verb',
        definition: 'to move fast',
        example: null,
        provider: 'user',
      });

      const result = await service.createUserDefinition({
        text: 'Run',
        language: 'en',
        kind: 'word',
        definition: 'to move fast',
        partOfSpeech: PartOfSpeech.VERB,
      });

      expect(mockWordsService.canonicalise).toHaveBeenCalledWith('Run');
      expect(mockWordsService.ensureExistsAndReturn).toHaveBeenCalledWith(
        'run',
        'en',
        LexicalKind.word,
      );
      expect(mockDefinitionService.createOne).toHaveBeenCalledWith(
        'word-id-1',
        { partOfSpeech: PartOfSpeech.VERB, definition: 'to move fast' },
        'user',
      );
      expect(result).toEqual({
        id: 'def-id-1',
        wordId: 'word-id-1',
        lemma: 'run',
        kind: LexicalKind.word,
        partOfSpeech: 'verb',
        definition: 'to move fast',
        example: null,
        provider: 'user',
      });
      expect(mockNlpService.analyze).not.toHaveBeenCalled();
    });

    it('expression happy path — NLP-derived canonical and kind override the declared kind', async () => {
      mockNlpService.analyze.mockResolvedValue({
        kind: 'expression',
        canonical: 'kick the bucket',
        headLemma: 'kick',
        contextMatch: null,
      });
      mockWordsService.ensureExistsAndReturn.mockResolvedValue({
        id: 'word-id-2',
        lemma: 'kick the bucket',
        language: 'en',
        kind: LexicalKind.expression,
      });
      mockDefinitionService.createOne.mockResolvedValue({
        id: 'def-id-2',
        wordId: 'word-id-2',
        partOfSpeech: 'phrase',
        definition: 'to die',
        example: null,
        provider: 'user',
      });

      const result = await service.createUserDefinition({
        text: 'kick the bucket',
        language: 'en',
        kind: 'phrasal_verb',
        definition: 'to die',
      });

      expect(mockNlpService.analyze).toHaveBeenCalledWith(
        'kick the bucket',
        undefined,
        'en',
      );
      expect(mockWordsService.ensureExistsAndReturn).toHaveBeenCalledWith(
        'kick the bucket',
        'en',
        LexicalKind.expression,
      );
      expect(result.kind).toBe(LexicalKind.expression);
      expect(result.partOfSpeech).toBe('phrase');
      expect(mockWordsService.canonicalise).not.toHaveBeenCalled();
    });

    it('kind="word" with multi-token text throws TextMustBeSingleWordError', async () => {
      await expect(
        service.createUserDefinition({
          text: 'run fast',
          language: 'en',
          kind: 'word',
          definition: 'to move fast',
          partOfSpeech: PartOfSpeech.VERB,
        }),
      ).rejects.toBeInstanceOf(TextMustBeSingleWordError);
    });

    it('kind="phrasal_verb" with text NLP analyzes as a single word throws TextMustBeExpressionError', async () => {
      mockNlpService.analyze.mockResolvedValue({
        kind: 'word',
        lemma: 'run',
        pos: PartOfSpeech.VERB,
        isIrregular: false,
        inflectionForms: null,
        extraForms: null,
      });

      await expect(
        service.createUserDefinition({
          text: 'run',
          language: 'en',
          kind: 'phrasal_verb',
          definition: 'to move fast',
        }),
      ).rejects.toBeInstanceOf(TextMustBeExpressionError);
    });

    it('kind="expression" with text NLP rejects propagates NlpInputInvalidError', async () => {
      mockNlpService.analyze.mockRejectedValue(new NlpInputInvalidError());

      await expect(
        service.createUserDefinition({
          text: 'one two three four five six seven',
          language: 'en',
          kind: 'expression',
          definition: 'means nothing',
        }),
      ).rejects.toBeInstanceOf(NlpInputInvalidError);

      expect(mockWordsService.ensureExistsAndReturn).not.toHaveBeenCalled();
    });

    it('NLP analyzing the expression text as kind="word" throws TextMustBeExpressionError', async () => {
      mockNlpService.analyze.mockResolvedValue({
        kind: 'word',
        lemma: 'run',
        pos: PartOfSpeech.VERB,
        isIrregular: false,
        inflectionForms: null,
        extraForms: null,
      });

      await expect(
        service.createUserDefinition({
          text: 'run fast now',
          language: 'en',
          kind: 'phrasal_verb',
          definition: 'to move fast',
        }),
      ).rejects.toBeInstanceOf(TextMustBeExpressionError);

      expect(mockWordsService.ensureExistsAndReturn).not.toHaveBeenCalled();
    });

    it('missing partOfSpeech for kind="word" throws PartOfSpeechRequiredError', async () => {
      await expect(
        service.createUserDefinition({
          text: 'run',
          language: 'en',
          kind: 'word',
          definition: 'to move fast',
        }),
      ).rejects.toBeInstanceOf(PartOfSpeechRequiredError);
    });

    it('partOfSpeech defaults to PHRASE for expressions when not provided', async () => {
      mockNlpService.analyze.mockResolvedValue({
        kind: 'phrasal_verb',
        canonical: 'run into',
        headLemma: 'run',
        contextMatch: null,
      });
      mockWordsService.ensureExistsAndReturn.mockResolvedValue({
        id: 'word-id-3',
        lemma: 'run into',
        language: 'en',
        kind: LexicalKind.phrasal_verb,
      });
      mockDefinitionService.createOne.mockResolvedValue({
        id: 'def-id-3',
        wordId: 'word-id-3',
        partOfSpeech: 'phrase',
        definition: 'to encounter',
        example: null,
        provider: 'user',
      });

      await service.createUserDefinition({
        text: 'run into',
        language: 'en',
        kind: 'phrasal_verb',
        definition: 'to encounter',
      });

      expect(mockDefinitionService.createOne).toHaveBeenCalledWith(
        'word-id-3',
        { partOfSpeech: PartOfSpeech.PHRASE, definition: 'to encounter' },
        'user',
      );
    });

    it('duplicate definition — DefinitionAlreadyExistsError from DefinitionService.createOne propagates', async () => {
      mockWordsService.ensureExistsAndReturn.mockResolvedValue({
        id: 'word-id-1',
        lemma: 'run',
        language: 'en',
        kind: LexicalKind.word,
      });
      mockDefinitionService.createOne.mockRejectedValue(
        new DefinitionAlreadyExistsError(),
      );

      await expect(
        service.createUserDefinition({
          text: 'run',
          language: 'en',
          kind: 'word',
          definition: 'to move fast',
          partOfSpeech: PartOfSpeech.VERB,
        }),
      ).rejects.toBeInstanceOf(DefinitionAlreadyExistsError);
    });

    it('example is forwarded to DefinitionService.createOne when provided, omitted when absent', async () => {
      mockWordsService.ensureExistsAndReturn.mockResolvedValue({
        id: 'word-id-1',
        lemma: 'run',
        language: 'en',
        kind: LexicalKind.word,
      });
      mockDefinitionService.createOne.mockResolvedValue({
        id: 'def-id-1',
        wordId: 'word-id-1',
        partOfSpeech: 'verb',
        definition: 'to move fast',
        example: 'She runs daily.',
        provider: 'user',
      });

      await service.createUserDefinition({
        text: 'run',
        language: 'en',
        kind: 'word',
        definition: 'to move fast',
        example: 'She runs daily.',
        partOfSpeech: PartOfSpeech.VERB,
      });

      expect(mockDefinitionService.createOne).toHaveBeenCalledWith(
        'word-id-1',
        {
          partOfSpeech: PartOfSpeech.VERB,
          definition: 'to move fast',
          example: 'She runs daily.',
        },
        'user',
      );
    });
  });
});
