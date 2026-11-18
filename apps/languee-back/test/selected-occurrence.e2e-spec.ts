import { ConfigService } from '@nestjs/config';
import { VocabularyController } from '../src/modules/learning/vocabulary/vocabulary.controller';
import { VocabularyService } from '../src/modules/learning/vocabulary/vocabulary.service';
import { NlpService } from '../src/modules/lexicon/enrichment/nlp/nlp.service';
import { RequestService } from '../src/modules/system/core/http/request.service';
import { PartOfSpeech } from '../src/modules/lexicon/types/part-of-speech.enum';

const nlpUrl = process.env['NLP_CROSS_SERVICE_URL'];
const integration = nlpUrl ? describe : describe.skip;

integration('selected occurrence across backend and NLP', () => {
  it('selects the contextual lemma and POS while retaining both headwords', async () => {
    const definition = (id: string, partOfSpeech: PartOfSpeech) => ({
      id,
      partOfSpeech,
      definition: id,
      example: null,
      provider: 'fixture',
      hasIrregularForms: false,
      inflectionForms: null,
    });
    const nlp = new NlpService(
      new RequestService(),
      new ConfigService({
        nlp: {
          baseUrl: nlpUrl,
          basicAuthLogin: process.env['NLP_CROSS_SERVICE_LOGIN'] ?? 'test',
          basicAuthPassword:
            process.env['NLP_CROSS_SERVICE_PASSWORD'] ?? 'test',
        },
      }),
    );
    const headwords = [
      {
        entryId: 'see',
        lemma: 'see',
        language: 'en',
        relations: [],
        partsOfSpeech: [
          {
            partOfSpeech: PartOfSpeech.VERB,
            definitions: [definition('see-verb', PartOfSpeech.VERB)],
          },
        ],
      },
      {
        entryId: 'saw',
        lemma: 'saw',
        language: 'en',
        relations: [],
        partsOfSpeech: [
          {
            partOfSpeech: PartOfSpeech.NOUN,
            definitions: [definition('saw-noun', PartOfSpeech.NOUN)],
          },
          {
            partOfSpeech: PartOfSpeech.VERB,
            definitions: [definition('saw-verb', PartOfSpeech.VERB)],
          },
        ],
      },
    ];
    const dictionary = {
      lookup: ({ lemma }: { lemma: string }) =>
        Promise.resolve({
          input: 'saw',
          language: 'en',
          kind: 'word',
          source: 'cache',
          preferred: { entryId: lemma, partOfSpeech: null },
          headwords,
        }),
    };
    const cards = {
      findCardsByDefinitionIdsAndUserId: () => Promise.resolve([]),
    };
    const vocabulary = new VocabularyService(
      dictionary as never,
      cards as never,
      nlp,
      {} as never,
      {} as never,
    );
    const controller = new VocabularyController(vocabulary);
    const lookup = (start: number, end: number) =>
      controller.lookup(
        {
          text: 'saw',
          context: 'I saw the saw.',
          selectionRanges: [{ start, end }],
          includeSuggestions: false,
        },
        { userId: 'integration' } as never,
      );
    const first = await lookup(2, 5);
    const second = await lookup(10, 13);
    expect(first.preferred).toEqual({
      entryId: 'see',
      partOfSpeech: PartOfSpeech.VERB,
    });
    expect(second.preferred).toEqual({
      entryId: 'saw',
      partOfSpeech: PartOfSpeech.NOUN,
    });
    expect(first.headwords.map((headword) => headword.lemma)).toEqual([
      'see',
      'saw',
    ]);
    expect(second.headwords.map((headword) => headword.lemma)).toEqual([
      'see',
      'saw',
    ]);
  });
});
