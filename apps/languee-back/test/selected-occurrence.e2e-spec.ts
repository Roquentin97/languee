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
          basicAuthLogin: 'test',
          basicAuthPassword: 'test',
        },
      }),
    );
    const headwords = [
      {
        wordId: 'see',
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
        wordId: 'saw',
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
          preferred: { wordId: lemma, partOfSpeech: null },
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
    const lookup = (start: string, end: string) =>
      controller.lookup(
        {
          word: 'saw',
          context: 'I saw the saw.',
          selectionStart: start,
          selectionEnd: end,
        },
        { userId: 'integration' } as never,
      );
    const first = await lookup('2', '5');
    const second = await lookup('10', '13');
    expect(first.preferred).toEqual({
      wordId: 'see',
      partOfSpeech: PartOfSpeech.VERB,
    });
    expect(second.preferred).toEqual({
      wordId: 'saw',
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
