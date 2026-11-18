import { ConfigService } from '@nestjs/config';
import { LexicalEntryKind } from '@prisma/client';
import { DictionaryService } from '../src/modules/lexicon/enrichment/dictionary/dictionary.service';
import { HeadwordDiscoveryService } from '../src/modules/lexicon/enrichment/dictionary/headword-discovery.service';
import type {
  DictionaryEntry,
  IDictionaryApiAdapter,
} from '../src/modules/lexicon/enrichment/dictionary/interfaces/dictionary-api-adapter.interface';
import { MorphologyService } from '../src/modules/lexicon/enrichment/morphology/morphology.service';
import type { MorphologyProvider } from '../src/modules/lexicon/enrichment/morphology/morphology-provider';
import { NlpService } from '../src/modules/lexicon/enrichment/nlp/nlp.service';
import { LexicalEntriesService } from '../src/modules/lexicon/entries/lexical-entries/lexical-entries.service';
import { DefinitionService } from '../src/modules/lexicon/entries/definitions/definitions.service';
import { PartOfSpeech } from '../src/modules/lexicon/types/part-of-speech.enum';
import { RequestService } from '../src/modules/system/core/http/request.service';
import { PrismaService } from '../src/modules/system/core/prisma/prisma.service';
import { VocabularyService } from '../src/modules/learning/vocabulary/vocabulary.service';

const enabled = process.env['PHRASAL_GROWTH_INTEGRATION'] === '1';
const integration = enabled ? describe : describe.skip;
const fixtureLemmas = ['turn', 'turn off'];

const morphologyProvider: MorphologyProvider = {
  findLemmaCandidates: async () => [],
  getInflections: async () => [],
  getInflectionsBatch: async (entries) =>
    entries.map((entry) => ({ ...entry, forms: [] })),
};

function fixtureEntry(lemma: string): DictionaryEntry {
  const definitions =
    lemma === 'turn'
      ? [
          {
            partOfSpeech: PartOfSpeech.VERB,
            definition: 'to change direction or orientation',
          },
        ]
      : lemma === 'turn off'
        ? [
            {
              partOfSpeech: PartOfSpeech.VERB,
              definition: 'to stop a machine or device',
            },
          ]
        : [];
  return { definitions, references: [] };
}

integration('context expression candidate growth', () => {
  let prisma: PrismaService;
  let nlpUrl = '';
  let service: VocabularyService;

  async function cleanFixtureRows(): Promise<void> {
    const entries = await prisma.lexicalEntry.findMany({
      where: { language: 'en', lemma: { in: fixtureLemmas } },
      select: { id: true },
    });
    const entryIds = entries.map(({ id }) => id);
    if (entryIds.length) {
      await prisma.lexicalForm.deleteMany({
        where: { entryId: { in: entryIds } },
      });
      await prisma.definition.deleteMany({
        where: { entryId: { in: entryIds } },
      });
      await prisma.lexicalEntry.deleteMany({ where: { id: { in: entryIds } } });
    }
    await prisma.lookupState.deleteMany({
      where: { language: 'en', term: { in: fixtureLemmas } },
    });
  }

  beforeAll(async () => {
    const databaseUrl = process.env['PHRASAL_GROWTH_DATABASE_URL'];
    nlpUrl = process.env['NLP_CROSS_SERVICE_URL'] ?? '';
    const nlpLogin = process.env['NLP_CROSS_SERVICE_LOGIN'];
    const nlpPassword = process.env['NLP_CROSS_SERVICE_PASSWORD'];
    if (!databaseUrl || !nlpUrl || !nlpLogin || !nlpPassword) {
      throw new Error(
        'Set PHRASAL_GROWTH_DATABASE_URL and NLP_CROSS_SERVICE_URL/LOGIN/PASSWORD to run the expression growth integration test',
      );
    }
    if (new URL(databaseUrl).pathname !== '/phrasal_growth') {
      throw new Error(
        'Expression growth integration requires the task-owned phrasal_growth database',
      );
    }
    prisma = new PrismaService(
      new ConfigService({ postgres: { databaseUrl } }),
    );
    await prisma.$connect();
    await cleanFixtureRows();
    const words = new LexicalEntriesService(prisma);
    const definitions = new DefinitionService(prisma);
    const morphology = new MorphologyService(prisma, morphologyProvider);
    const adapter: IDictionaryApiAdapter = {
      providerName: 'expression-growth-fixture',
      fetch: async (lemma) => fixtureEntry(lemma).definitions,
      fetchEntry: async (lemma) => fixtureEntry(lemma),
    };
    const discovery = new HeadwordDiscoveryService(
      prisma,
      words,
      definitions,
      adapter,
      morphologyProvider,
      morphology,
    );
    const dictionary = new DictionaryService(discovery);
    const nlp = new NlpService(
      new RequestService(),
      new ConfigService({
        nlp: {
          baseUrl: nlpUrl,
          basicAuthLogin: nlpLogin,
          basicAuthPassword: nlpPassword,
        },
      }),
    );
    const cards = { findCardsByDefinitionIdsAndUserId: async () => [] };
    service = new VocabularyService(
      dictionary,
      cards as never,
      nlp,
      words,
      definitions,
    );
  }, 30_000);

  afterAll(async () => {
    await cleanFixtureRows();
    await prisma.$disconnect();
  });

  it('discovers and persists an expression before suggesting it from a later verb lookup', async () => {
    const context = 'We should turn off the lights.';
    const selectedVerb = [{ start: 10, end: 14 }];
    const selectedExpression = [
      { start: 10, end: 14 },
      { start: 15, end: 18 },
    ];
    await prisma.$queryRaw`SELECT 1`;

    const initialStarted = Date.now();
    const initial = await service.lookup({
      text: 'turn',
      language: 'en',
      userId: 'growth-integration',
      context,
      selectionRanges: selectedVerb,
    });
    const initialDurationMs = Date.now() - initialStarted;
    expect(initial.alternatives).toEqual([]);
    expect(initial.kind).toBe(LexicalEntryKind.word);
    expect(
      await prisma.lexicalEntry.count({
        where: { lemma: 'turn off', language: 'en' },
      }),
    ).toBe(0);

    const explicitStarted = Date.now();
    const explicit = await service.lookup({
      text: 'turn off',
      language: 'en',
      userId: 'growth-integration',
      context,
      selectionRanges: selectedExpression,
    });
    const explicitDurationMs = Date.now() - explicitStarted;
    expect(explicit.kind).toBe(LexicalEntryKind.phrasal_verb);
    expect(explicit.lookupId).toEqual(expect.any(String));
    expect(
      await prisma.lexicalEntry.count({
        where: { lemma: 'turn off', language: 'en', kind: 'phrasal_verb' },
      }),
    ).toBe(1);
    expect(
      await prisma.definition.count({
        where: {
          entry: { lemma: 'turn off', language: 'en' },
          provider: 'expression-growth-fixture',
        },
      }),
    ).toBe(1);

    const suggestedStarted = Date.now();
    const suggested = await service.lookup({
      text: 'turn',
      language: 'en',
      userId: 'growth-integration',
      context,
      selectionRanges: selectedVerb,
    });
    const suggestedDurationMs = Date.now() - suggestedStarted;
    expect(suggested.alternatives).toEqual([
      {
        type: 'expression',
        text: 'turn off',
        lemma: 'turn off',
        entryId: (
          await prisma.lexicalEntry.findUniqueOrThrow({
            where: { lemma_language: { lemma: 'turn off', language: 'en' } },
          })
        ).id,
        selectionRanges: selectedExpression,
        reason: 'context_match',
        prominence: 'normal',
      },
    ]);

    process.stdout.write(
      `EXPRESSION_GROWTH_TIMINGS ${JSON.stringify({
        initialVerbLookupMs: initialDurationMs,
        explicitExpressionLookupMs: explicitDurationMs,
        suggestedVerbLookupMs: suggestedDurationMs,
        provider: 'deterministic in-process fixture',
        nlp: nlpUrl,
        database: 'task-owned PostgreSQL phrasal_growth',
      })}\n`,
    );
  }, 30_000);
});
