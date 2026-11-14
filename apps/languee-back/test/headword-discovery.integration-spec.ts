import { MorphologyService } from '../src/modules/lexicon/enrichment/morphology/morphology.service';
import { readFile } from 'node:fs/promises';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../src/modules/system/core/prisma/prisma.service';
import { WordsService } from '../src/modules/lexicon/entries/words/words.service';
import { DefinitionService } from '../src/modules/lexicon/entries/definitions/definitions.service';
import { HeadwordDiscoveryService } from '../src/modules/lexicon/enrichment/dictionary/headword-discovery.service';
import { DictionaryService } from '../src/modules/lexicon/enrichment/dictionary/dictionary.service';
import { parseWiktionaryEntry } from '../src/modules/lexicon/enrichment/dictionary/parsers/wiktionary.parser';
import type {
  MorphologyProvider,
  InflectionForm,
} from '../src/modules/lexicon/enrichment/morphology/morphology-provider';
import { PartOfSpeech } from '../src/modules/lexicon/types/part-of-speech.enum';
import { projectParadigm } from '../src/modules/lexicon/enrichment/morphology/paradigm';
import corpus from '../src/modules/lexicon/enrichment/dictionary/fixtures/corpus.json';

const url = process.env.HEADWORD_TEST_DATABASE_URL;
if (!url)
  throw new Error(
    'HEADWORD_TEST_DATABASE_URL must name an isolated empty PostgreSQL 18 database',
  );
const prisma = new PrismaService(
  new ConfigService({ postgres: { databaseUrl: url } }),
);
const raw = new Client({ connectionString: url });
const fixtures = join(
  __dirname,
  '../src/modules/lexicon/enrichment/dictionary/fixtures',
);
const tags: Record<string, string[]> = {
  NNS: ['plural'],
  VBD: ['past'],
  VBN: ['past_participle'],
  VBZ: ['present_3sg'],
  VBP: ['present_non_3sg'],
  VBG: ['present_participle', 'gerund'],
  JJR: ['comparative'],
  JJS: ['superlative'],
  RBR: ['comparative'],
  RBS: ['superlative'],
};
const paradigms = corpus.lemminflect_paradigm_cases;
const morphology: MorphologyProvider = {
  findLemmaCandidates: jest.fn((surface: string) => {
    const probe = corpus.lemminflect_candidate_cases.find(
      (c) => c.surface === surface,
    );
    return Promise.resolve(
      Object.entries(
        (probe?.observed_lemminflect_candidates_by_pos ?? {}) as Record<
          string,
          string[]
        >,
      ).flatMap(([p, lemmas]) =>
        lemmas.map((lemma) => ({
          lemma,
          partOfSpeech: (p === 'auxiliary' ? 'verb' : p) as PartOfSpeech,
        })),
      ),
    );
  }),
  getInflections: jest.fn((lemma: string, pos: PartOfSpeech) => {
    if (lemma === 'interest' && pos === PartOfSpeech.VERB)
      return Promise.resolve([
        { form: 'interested', formType: 'past' },
        { form: 'interested', formType: 'past_participle' },
      ] as InflectionForm[]);
    const controlled = corpus.reference_morphology_cases.find(
      (c) => c.lemma === lemma && c.part_of_speech === String(pos),
    );
    if (controlled)
      return Promise.resolve(
        controlled.expected_single_token_mappings.map((f) => ({
          form: f.form,
          formType: f.relation_type,
        })) as InflectionForm[],
      );
    const probe = paradigms.find(
      (c) => c.lemma === lemma && c.part_of_speech === String(pos),
    );
    return Promise.resolve(
      Object.entries(
        (probe?.observed_lemminflect_tags ?? {}) as Record<string, string[]>,
      ).flatMap(([tag, forms]) =>
        forms.flatMap((form) =>
          (tags[tag] ?? []).map((formType) => ({ form, formType })),
        ),
      ) as InflectionForm[],
    );
  }),
};
const dictionary = {
  providerName: 'fixture',
  fetch: jest.fn(() => Promise.resolve([])),
  fetchEntry: jest.fn(async (lemma: string) => {
    if (lemma === 'worse')
      return parseWiktionaryEntry(
        JSON.parse(await readFile(join(fixtures, 'worse.json'), 'utf8')),
        'en',
        lemma,
      );
    if (lemma === 'badly')
      return {
        definitions: [
          { partOfSpeech: PartOfSpeech.ADVERB, definition: 'In a bad manner.' },
        ],
        references: [],
      };
    const known = corpus.dictionary_cases.find((c) => c.surface === lemma);
    if (known)
      return parseWiktionaryEntry(
        JSON.parse(await readFile(join(fixtures, `${lemma}.json`), 'utf8')),
        'en',
        lemma,
      );
    const pos =
      lemma === 'interested'
        ? ['adjective']
        : ['child', 'mouse', 'bettor', 'ax'].includes(lemma)
          ? ['noun', ...(lemma === 'ax' ? ['verb'] : [])]
          : ['see', 'find', 'run', 'meet', 'exhaust', 'interest'].includes(
                lemma,
              )
            ? ['verb']
            : corpus.reference_morphology_cases
                .filter((c) => c.lemma === lemma)
                .map((c) => c.part_of_speech);
    return {
      definitions: pos.map((p) => ({
        partOfSpeech: p as PartOfSpeech,
        definition: `Independent ${lemma}/${p}.`,
      })),
      references: [],
    };
  }),
};
const morphologyService = new MorphologyService(prisma, morphology);
const words = new WordsService(prisma);
const service = new HeadwordDiscoveryService(
  prisma,
  words,
  new DefinitionService(prisma),
  dictionary,
  morphology,
  morphologyService,
);
const state = (term: string) =>
  prisma.lookupState.findUnique({
    where: { term_language: { term, language: 'en' } },
  });
const lookup = (term: string, lemma?: string) =>
  service.discover(term, 'en', lemma);
const pairs = (r: Awaited<ReturnType<typeof lookup>>) =>
  r.headwords
    .flatMap((w) => [
      ...new Set(w.definitions.map((d) => `${w.lemma}/${d.partOfSpeech}`)),
    ])
    .sort();
const rows = async (form: string) =>
  (await prisma.wordForm.findMany({ where: { form }, include: { word: true } }))
    .map((r) => `${r.word.lemma}/${r.partOfSpeech}/${r.relationType}`)
    .sort();

beforeAll(async () => {
  await raw.connect();
  const migrations = join(__dirname, '../prisma/migrations');
  for (const m of readdirSync(migrations)
    .filter((m) => m !== 'migration_lock.toml')
    .sort()) {
    if (m === '20261108000000_headword_discovery') {
      await raw.query(`INSERT INTO users(id,email,password_hash,updated_at) VALUES ('00000000-0000-0000-0000-000000000001','saved@example.com','hash',now());
        INSERT INTO words(id,lemma) VALUES ('00000000-0000-0000-0000-000000000002','historical');
        INSERT INTO definitions(id,word_id,part_of_speech,definition,provider,inflection_forms,has_irregular_forms,gap_fill_metadata) VALUES ('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000002','noun','Historical sense','fixture','{"type":"noun","plural":"bad"}',true,'{"keep":true}');
        INSERT INTO decks(id,user_id,name,updated_at) VALUES ('00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000001','Saved',now());
        INSERT INTO cards(id,user_id,definition_id,type,inflection_forms,updated_at) VALUES ('00000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003','cloze','{"type":"noun","plural":"historicals"}',now());
        INSERT INTO card_ankidroid_exports(card_id,status,updated_at) VALUES ('00000000-0000-0000-0000-000000000005','completed',now());
        INSERT INTO card_decks(card_id,deck_id) VALUES ('00000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000004');
        INSERT INTO review_logs(card_id,rating,state_before,previous_interval_days,new_interval_days,stability_after,difficulty_after,due_at_after) VALUES ('00000000-0000-0000-0000-000000000005','good','new',0,1,1,1,now());`);
    }
    await raw.query(readFileSync(join(migrations, m, 'migration.sql'), 'utf8'));
  }
  const saved = await prisma.card.findUniqueOrThrow({
    where: { id: '00000000-0000-0000-0000-000000000005' },
    include: {
      definition: true,
      decks: true,
      reviewLogs: true,
      ankidroidExport: true,
    },
  });
  expect(saved.inflectionForms).toEqual({
    type: 'noun',
    plural: 'historicals',
  });
  expect(saved.definition?.gapFillMetadata).toEqual({ keep: true });
  expect(saved.definitionId).toBe('00000000-0000-0000-0000-000000000003');
  expect(saved.ankidroidExport?.status).toBe('completed');
  expect(saved.decks).toHaveLength(1);
  expect(saved.reviewLogs).toHaveLength(1);
  const columns = await raw.query(
    `SELECT column_name AS "columnName" FROM information_schema.columns WHERE table_name='definitions'`,
  );
  const names = columns.rows.map((r: { columnName: string }) => r.columnName);
  expect(names).not.toContain('inflection_forms');
  expect(names).not.toContain('has_irregular_forms');
}, 30000);
afterAll(async () => {
  await prisma.$disconnect();
  await raw.end();
});
beforeEach(async () => {
  await raw.query('TRUNCATE words, lookup_states CASCADE');
  jest.clearAllMocks();
  jest.useFakeTimers({
    doNotFake: [
      'nextTick',
      'setImmediate',
      'setTimeout',
      'clearTimeout',
      'performance',
    ],
  });
  jest.setSystemTime(new Date('2026-11-08T00:00:00Z'));
});
afterEach(() => jest.useRealTimers());

it('resolves the annotated worse reference on cold and warm lookup', async () => {
  const cold = await lookup('worse');
  expect(pairs(cold)).toContain('badly/adverb');
  expect(await rows('worse')).toContain('badly/adverb/comparative');
  const warm = await lookup('worse');
  expect(pairs(warm)).toEqual(pairs(cold));
});

it('keeps saw candidates independent of the first contextual lemma', async () => {
  const first = await lookup('saw', 'see');
  const warm = await lookup('saw', 'saw');
  expect(pairs(warm)).toEqual(pairs(first));
  await raw.query('TRUNCATE words, lookup_states CASCADE');
  const reverse = await lookup('saw', 'saw');
  const reverseWarm = await lookup('saw', 'see');
  expect(pairs(reverse)).toEqual(pairs(first));
  expect(pairs(reverseWarm)).toEqual(pairs(first));
});

it('C01/C02/C12 well → good → better → better keeps discovery independent of reverse mappings', async () => {
  await lookup('well');
  await lookup('good');
  expect(await state('better')).toBeNull();
  expect(await rows('better')).toEqual(
    expect.arrayContaining([
      'well/adverb/comparative',
      'well/adjective/comparative',
      'good/adjective/comparative',
    ]),
  );
  const first = await lookup('better');
  expect(pairs(first)).toEqual([
    'better/adjective',
    'better/noun',
    'better/verb',
    'bettor/noun',
    'good/adjective',
    'well/adjective',
    'well/adverb',
  ]);
  const calls = dictionary.fetchEntry.mock.calls.length;
  const ids = first.headwords.flatMap((w) => w.definitions.map((d) => d.id));
  expect((await state('better'))?.discoveryCompletedAt).toEqual(new Date());
  const second = await lookup('BETTER');
  expect(second.source).toBe('cache');
  expect(second.headwords).toEqual(first.headwords);
  expect(
    first.headwords.find((w) => w.lemma === 'good')?.relations,
  ).toContainEqual({ partOfSpeech: 'adjective', relationType: 'comparative' });
  expect(
    second.headwords.flatMap((w) => w.definitions.map((d) => d.id)),
  ).toEqual(ids);
  expect(dictionary.fetchEntry).toHaveBeenCalledTimes(calls);
  expect(morphology.findLemmaCandidates).toHaveBeenCalledTimes(3);
});
it('C03/C14 better → well caches the entire supported inventory once', async () => {
  const result = await lookup('better');
  expect(pairs(result)).not.toContain('well/noun');
  expect((await state('well'))?.dictionaryFetchedAt).toEqual(new Date());
  expect((await state('well'))?.discoveryCompletedAt).toBeNull();
  const direct = await lookup('well');
  expect(pairs(direct)).toEqual(
    expect.arrayContaining([
      'well/noun',
      'well/verb',
      'well/interjection',
      'well/adjective',
      'well/adverb',
    ]),
  );
  expect(
    dictionary.fetchEntry.mock.calls.filter((c) => c[0] === 'well'),
  ).toHaveLength(1);
});
it.each([
  ['poised', 'poise'],
  ['poise', 'poised'],
  ['children', 'child'],
  ['child', 'children'],
])('C04/C05/C07/C08 %s → %s', async (first, second) => {
  await lookup(first);
  expect((await state(second))?.discoveryCompletedAt ?? null).toBeNull();
  await lookup(second);
  const poised = await lookup('poised');
  expect(pairs(poised)).toEqual(['poise/verb', 'poised/adjective']);
  expect(pairs(await lookup('poise'))).toEqual(['poise/noun', 'poise/verb']);
  expect(
    await prisma.word.findUnique({
      where: { lemma_language: { lemma: 'children', language: 'en' } },
    }),
  ).toBeNull();
  await lookup('children');
  expect(await rows('children')).toEqual(['child/noun/plural']);
});
it.each(['axes', 'saw', 'found', 'running', 'meeting'])(
  'C06/C09/C10/C11/C22/C23/C25 %s exact typed references',
  async (term) => {
    const result = await lookup(term);
    const gold = corpus.dictionary_cases.find((c) => c.surface === term)!;
    const expected = gold.morphological_references
      .flatMap((r) => r.types.map((t) => `${r.target}/${r.target_pos}/${t}`))
      .sort();
    expect(await rows(term)).toEqual(expected);
    if (term === 'axes')
      expect(result.headwords.some((w) => w.lemma === 'axes')).toBe(false);
    expect(
      result.headwords
        .flatMap((w) => w.definitions)
        .some((d) =>
          /^(?:simple past|plural|past participle) of/.test(d.definition),
        ),
    ).toBe(false);
  },
);
it('C13/S12 legacy Word without state is safely fetched without duplicating definitions', async () => {
  await lookup('poise');
  const old = await prisma.definition.findMany();
  await prisma.lookupState.deleteMany();
  await lookup('poise');
  expect((await prisma.definition.findMany()).map((d) => d.id).sort()).toEqual(
    old.map((d) => d.id).sort(),
  );
});
it('C15 completed negative results do not fabricate words or repeat provider calls', async () => {
  await lookup('qzvxnotaword');
  await lookup('qzvxnotaword');
  expect(await prisma.word.count()).toBe(0);
  expect(dictionary.fetchEntry).toHaveBeenCalledTimes(1);
  expect((await state('qzvxnotaword'))?.dictionaryFetchedAt).toEqual(
    new Date(),
  );
  expect((await state('qzvxnotaword'))?.discoveryCompletedAt).toEqual(
    new Date(),
  );
});
it('C16/C17 dependency failure retries without hiding required validation', async () => {
  dictionary.fetchEntry.mockRejectedValueOnce(new Error('503'));
  await expect(lookup('better')).rejects.toThrow('503');
  expect(await state('better')).toBeNull();
  const implementation = dictionary.fetchEntry.getMockImplementation()!;
  dictionary.fetchEntry.mockImplementationOnce(async (lemma) => {
    const entry = await implementation(lemma);
    dictionary.fetchEntry.mockRejectedValueOnce(
      new Error('dependency timeout'),
    );
    return entry;
  });
  await expect(lookup('better')).rejects.toThrow('dependency timeout');
  expect((await state('better'))?.discoveryCompletedAt ?? null).toBeNull();
  expect(pairs(await lookup('better'))).toContain('well/adverb');
});
it('C19 concurrent lookups remain idempotent', async () => {
  const [a, b] = await Promise.all([lookup('better'), lookup('better')]);
  expect(pairs(a)).toEqual(pairs(b));
  const before = [
    await prisma.word.count(),
    await prisma.definition.count(),
    await prisma.wordForm.count(),
    await prisma.lookupState.count(),
  ];
  await lookup('better');
  expect([
    await prisma.word.count(),
    await prisma.definition.count(),
    await prisma.wordForm.count(),
    await prisma.lookupState.count(),
  ]).toEqual(before);
});
it('C24 alternative spelling is POS-scoped and excluded from card paradigms', async () => {
  await lookup('better');
  expect(await rows('better')).toContain('bettor/noun/alternative_spelling');
  expect(
    projectParadigm('bettor', 'noun', [
      {
        form: 'better',
        partOfSpeech: 'noun',
        relationType: 'alternative_spelling',
      },
    ]),
  ).toEqual({
    inflectionForms: { type: 'noun', singular: 'bettor' },
    hasIrregularForms: false,
  });
});
it.each(corpus.reference_morphology_cases)(
  '$id $lemma/$part_of_speech controlled morphology storage and reverse lookup',
  async (c) => {
    await lookup(c.lemma);
    const word = await prisma.word.findUniqueOrThrow({
      where: { lemma_language: { lemma: c.lemma, language: 'en' } },
    });
    const forms = await prisma.wordForm.findMany({
      where: { wordId: word.id },
    });
    expect(
      forms.map((f) => `${f.form}/${f.partOfSpeech}/${f.relationType}`).sort(),
    ).toEqual(
      c.expected_single_token_mappings
        .map((f) => `${f.form}/${c.part_of_speech}/${f.relation_type}`)
        .sort(),
    );
    for (const f of c.expected_single_token_mappings)
      expect(pairs(await lookup(f.form))).toContain(
        `${c.lemma}/${c.part_of_speech}`,
      );
    expect(
      projectParadigm(c.lemma, 'interjection', forms).inflectionForms,
    ).toBeNull();
  },
);
it.each(corpus.context_semantics_cases)(
  '$id context does not suppress discovery for $surface',
  async (c) => {
    const expected: Record<string, string[]> = {
      poised: ['poise/verb', 'poised/adjective'],
      better: [
        'better/adjective',
        'better/noun',
        'better/verb',
        'bettor/noun',
        'good/adjective',
        'well/adjective',
        'well/adverb',
      ],
      saw: ['saw/noun', 'saw/verb', 'see/verb'],
      found: ['find/verb', 'found/noun', 'found/verb'],
      axes: ['ax/noun', 'ax/verb', 'axe/noun', 'axe/verb', 'axis/noun'],
      running: [
        'run/verb',
        'running/adjective',
        'running/adverb',
        'running/noun',
        'running/preposition',
      ],
      meeting: ['meet/verb', 'meeting/noun'],
      well: [
        'well/adjective',
        'well/adverb',
        'well/interjection',
        'well/noun',
        'well/verb',
      ],
      interested: ['interest/verb', 'interested/adjective'],
      exhausted: ['exhaust/verb', 'exhausted/adjective'],
    };
    const result = await lookup(c.surface);
    expect(pairs(result)).toEqual(expected[c.surface].sort());
    const cached = await lookup(c.surface, 'unrelated');
    expect(pairs(cached)).toEqual(pairs(result));
    expect(
      dictionary.fetchEntry.mock.calls.some((call) => call[0] === 'unrelated'),
    ).toBe(true);
  },
);

it('C17 safe surface fetch survives a later morphology candidate failure', async () => {
  const find = jest.mocked(morphology.findLemmaCandidates);
  find.mockRejectedValueOnce(new Error('morphology outage'));
  await expect(lookup('well')).rejects.toThrow('morphology outage');
  expect((await state('well'))?.dictionaryFetchedAt).toEqual(new Date());
  expect((await state('well'))?.discoveryCompletedAt).toBeNull();
  await lookup('well');
  expect(
    dictionary.fetchEntry.mock.calls.filter((c) => c[0] === 'well'),
  ).toHaveLength(1);
  expect((await state('well'))?.discoveryCompletedAt).toEqual(new Date());
});
it('C18 unresolved references are neither definitions nor validated mappings', async () => {
  dictionary.fetchEntry.mockResolvedValueOnce(
    parseWiktionaryEntry(
      {
        en: [
          {
            partOfSpeech: 'Noun',
            definitions: [
              {
                definition:
                  '<span class="form-of-definition">derived from <span class="form-of-definition-link"><a href="/wiki/cat" title="cat">cat</a></span></span>',
              },
            ],
          },
        ],
      },
      'en',
      'uncertain',
    ),
  );
  expect(pairs(await lookup('uncertain'))).toEqual([]);
  expect(await prisma.wordForm.count()).toBe(0);
  expect(await prisma.definition.count()).toBe(0);
  expect((await state('uncertain'))?.dictionaryFetchedAt).toEqual(new Date());
  expect((await state('uncertain'))?.discoveryCompletedAt).toEqual(new Date());
});
it('C20 NFC and case-normalized selected spelling share state and mappings', async () => {
  await lookup('BETTER');
  const first = await prisma.wordForm.count();
  await lookup('Better');
  expect(await prisma.wordForm.count()).toBe(first);
  expect(await prisma.lookupState.count({ where: { term: 'better' } })).toBe(1);
  await lookup('Café');
  await lookup('Cafe\u0301');
  expect(
    dictionary.fetchEntry.mock.calls.filter((c) => c[0] === 'café'),
  ).toHaveLength(1);
});

import { rankLexicalGroups } from '../src/modules/learning/vocabulary/lexical-ranking';
import { CardsService } from '../src/modules/learning/cards/cards.service';
import { DecksService } from '../src/modules/learning/decks/decks.service';
import { LexicalEvaluationService } from '../src/modules/learning/lexical-evaluation/lexical-evaluation.service';
it('records a disagreement after a tracked card save', async () => {
  const userId = '00000000-0000-0000-0000-000000000001';
  const deck = await prisma.deck.findFirstOrThrow({ where: { userId } });
  const base = await new DictionaryService(service).lookup({
    word: 'saw',
    lemma: 'see',
    language: 'en',
    kind: 'word',
  });
  const evaluation = new LexicalEvaluationService(prisma);
  const lookupId = '00000000-0000-7000-8000-000000000010';
  evaluation.scheduleLookup(
    lookupId,
    { word: 'saw', language: 'en', userId, context: 'They saw wood' },
    {
      kind: 'word',
      lemma: 'see',
      pos: PartOfSpeech.VERB,
      rawPos: 'VERB',
      modelVersion: 'fixture@1',
      isIrregular: false,
      inflectionForms: null,
    },
    base,
    rankLexicalGroups(base.headwords, 'see', PartOfSpeech.VERB, true),
  );
  for (let i = 0; i < 50; i++) {
    if (await prisma.evalLexicalLookup.findUnique({ where: { id: lookupId } }))
      break;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  const saw = base.headwords
    .find((w) => w.lemma === 'saw')!
    .partsOfSpeech.find((g) => g.partOfSpeech === PartOfSpeech.VERB)!
    .definitions[0];
  const cards = new CardsService(
    prisma,
    new DecksService(prisma),
    new DefinitionService(prisma),
    morphologyService,
    evaluation,
  );
  const first = await cards.create(
    userId,
    deck.id,
    saw.id,
    undefined,
    null,
    lookupId,
  );
  const retry = await cards.create(
    userId,
    deck.id,
    saw.id,
    undefined,
    null,
    lookupId,
  );
  expect(retry.map((card) => card.id)).toEqual(first.map((card) => card.id));
  let choice = await prisma.evalLexicalLearnerChoice.findUnique({
    where: { lookupId },
  });
  for (let i = 0; !choice && i < 20; i++) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    choice = await prisma.evalLexicalLearnerChoice.findUnique({
      where: { lookupId },
    });
  }
  expect(choice).not.toBeNull();
  expect(choice?.chosenDefinitionId).toBe(saw.id);
  expect(choice?.chosenLemma).toBe('saw');
});
it('creates a card from a definition in the hierarchical lookup response', async () => {
  const dictionaryService = new DictionaryService(service);
  const response = await dictionaryService.lookup({
    word: 'better',
    lemma: 'good',
    language: 'en',
    kind: 'word',
  });
  const headword = response.headwords.find((word) => word.lemma === 'good');
  const definition = headword?.partsOfSpeech.find(
    (group) => group.partOfSpeech === PartOfSpeech.ADJECTIVE,
  )?.definitions[0];
  expect(definition).toBeDefined();
  const userId = '00000000-0000-0000-0000-000000000001';
  const deck = await prisma.deck.findFirstOrThrow({ where: { userId } });
  const cards = new CardsService(
    prisma,
    new DecksService(prisma),
    new DefinitionService(prisma),
    morphologyService,
  );
  const created = await cards.create(
    userId,
    deck.id,
    definition!.id,
    'It is better',
    null,
  );
  expect(created[0].definitionId).toBe(definition!.id);
});

it.each([
  ['go', 'verb', true],
  ['child', 'noun', true],
  ['good', 'adjective', true],
  ['well', 'adverb', true],
  ['walk', 'verb', false],
  ['well', 'noun', false],
  ['poise', 'verb', false],
])(
  'S07/S08/S09 new %s/%s card snapshot uses only its canonical paradigm',
  async (lemma, pos, irregular) => {
    const userId = '00000000-0000-0000-0000-000000000001';
    const deck = await prisma.deck.findFirstOrThrow({ where: { userId } });
    let word = await prisma.word.findUnique({
      where: { lemma_language: { lemma: lemma, language: 'en' } },
    });
    if (!word)
      word = await prisma.word.create({
        data: { lemma: lemma, language: 'en' },
      });
    const definition = await prisma.definition.create({
      data: {
        wordId: word.id,
        partOfSpeech: pos,
        definition: 'Independent sense.',
        provider: 'fixture',
      },
    });
    const forms = await morphology.getInflections(
      lemma,
      pos as PartOfSpeech,
      'en',
    );
    await prisma.wordForm.createMany({
      data: forms.map((f) => ({
        wordId: word.id,
        partOfSpeech: pos,
        form: f.form,
        relationType: f.formType,
      })),
    });
    await prisma.wordForm.create({
      data: {
        wordId: word.id,
        partOfSpeech: pos,
        form: 'alias',
        relationType: 'alternative_spelling',
      },
    });
    const cards = new CardsService(
      prisma,
      new DecksService(prisma),
      new DefinitionService(prisma),
      morphologyService,
    );
    const created = await cards.create(
      userId,
      deck.id,
      definition.id,
      'Original Context',
      { type: 'verb', base: 'unrelated', past: 'contamination' },
    );
    expect(created.some((c) => c.type === 'inflection')).toBe(irregular);
    const cloze = created.find((c) => c.type === 'cloze')!;
    expect(JSON.stringify(cloze.inflectionForms)).not.toContain('alias');
    expect(JSON.stringify(cloze.inflectionForms)).not.toContain(
      'contamination',
    );
    if (lemma === 'well' && pos === 'noun')
      expect(JSON.stringify(cloze.inflectionForms)).not.toContain('better');
    expect(cloze.context).toBe('Original Context');
  },
);

test('independent candidates share a four-request provider limit', async () => {
  const original = dictionary.fetchEntry.getMockImplementation()!;
  const started: string[] = [];
  const releases = new Map<string, () => void>();
  let notify!: () => void;
  let next = new Promise<void>((resolve) => {
    notify = resolve;
  });
  const candidates = ['one', 'two', 'three', 'four', 'five', 'six'];
  jest
    .mocked(morphology.findLemmaCandidates)
    .mockImplementationOnce(() =>
      Promise.resolve(
        candidates.map((lemma) => ({ lemma, partOfSpeech: PartOfSpeech.NOUN })),
      ),
    );
  dictionary.fetchEntry.mockImplementation(async (lemma) => {
    if (!candidates.includes(lemma)) return original(lemma);
    started.push(lemma);
    notify();
    await new Promise<void>((resolve) => releases.set(lemma, resolve));
    return { definitions: [], references: [] };
  });
  const result = lookup('cohort');
  while (started.length < 4) {
    await next;
    next = new Promise((resolve) => {
      notify = resolve;
    });
  }
  expect(started).toHaveLength(4);
  releases.get(started[0])!();
  while (started.length < 5) {
    await next;
    next = new Promise((resolve) => {
      notify = resolve;
    });
  }
  releases.get(started[1])!();
  while (started.length < 6) {
    await next;
    next = new Promise((resolve) => {
      notify = resolve;
    });
  }
  for (const release of releases.values()) release();
  await result;
  dictionary.fetchEntry.mockImplementation(original);
});

test('overlapping lookups share a pending headword fetch and failures retry', async () => {
  const original = dictionary.fetchEntry.getMockImplementation()!;
  const originalCandidates = jest
    .mocked(morphology.findLemmaCandidates)
    .getMockImplementation()!;
  let release!: () => void;
  let started!: () => void;
  const began = new Promise<void>((resolve) => {
    started = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const seam = service as unknown as {
    fetchEntry(lemma: string, language: string): Promise<unknown>;
  };
  const originalFetch = seam.fetchEntry.bind(service);
  let joined!: () => void;
  const bothJoined = new Promise<void>((resolve) => {
    joined = resolve;
  });
  let participants = 0;
  const fetchSpy = jest
    .spyOn(seam, 'fetchEntry')
    .mockImplementation((lemma, language) => {
      const work = originalFetch(lemma, language);
      if (lemma === 'shared' && ++participants === 2) joined();
      return work;
    });
  let calls = 0;
  dictionary.fetchEntry.mockImplementation(async (lemma) => {
    if (lemma !== 'shared') return original(lemma);
    calls++;
    started();
    await gate;
    throw new Error('provider failed');
  });
  jest
    .mocked(morphology.findLemmaCandidates)
    .mockImplementation((surface) =>
      Promise.resolve(
        surface.startsWith('surface')
          ? [{ lemma: 'shared', partOfSpeech: PartOfSpeech.NOUN }]
          : [],
      ),
    );
  const first = lookup('surface-one');
  const second = lookup('surface-two');
  await began;
  await bothJoined;
  release();
  await expect(first).rejects.toThrow('provider failed');
  await expect(second).rejects.toThrow('provider failed');
  expect(calls).toBe(1);
  fetchSpy.mockRestore();
  dictionary.fetchEntry.mockImplementation(original);
  await lookup('surface-one');
  expect(await state('shared')).toBeTruthy();
  jest
    .mocked(morphology.findLemmaCandidates)
    .mockImplementation(originalCandidates);
});

test('cycles validate both directions after the full inventories are stored', async () => {
  const original = dictionary.fetchEntry.getMockImplementation()!;
  const originalCandidates = jest
    .mocked(morphology.findLemmaCandidates)
    .getMockImplementation()!;
  jest.mocked(morphology.findLemmaCandidates).mockResolvedValue([]);
  dictionary.fetchEntry.mockImplementation(async (lemma) => {
    if (!['cycle-a', 'cycle-b'].includes(lemma)) return original(lemma);
    const target = lemma === 'cycle-a' ? 'cycle-b' : 'cycle-a';
    return {
      definitions: [
        {
          partOfSpeech: PartOfSpeech.NOUN,
          definition: `Definition of ${lemma}`,
        },
      ],
      references: [
        {
          category: 'alternative_spelling',
          source: lemma,
          sourcePos: PartOfSpeech.NOUN,
          targets: [target],
          targetPos: PartOfSpeech.NOUN,
          relationTypes: ['alternative_spelling'],
          text: '',
        },
      ],
    };
  });
  const found = await lookup('cycle-a');
  expect(pairs(found)).toEqual(['cycle-a/noun', 'cycle-b/noun']);
  expect(await rows('cycle-a')).toContain('cycle-b/noun/alternative_spelling');
  expect(await rows('cycle-b')).toContain('cycle-a/noun/alternative_spelling');
  expect((await state('cycle-a'))?.dictionaryFetchedAt).toBeTruthy();
  expect((await state('cycle-b'))?.dictionaryFetchedAt).toBeTruthy();
  dictionary.fetchEntry.mockImplementation(original);
  jest
    .mocked(morphology.findLemmaCandidates)
    .mockImplementation(originalCandidates);
});

test('discovery batches and indexes canonical paradigms across reference targets', async () => {
  const original = dictionary.fetchEntry.getMockImplementation()!;
  const batch = jest.fn(
    async (entries: { lemma: string; partOfSpeech: PartOfSpeech }[]) =>
      entries.map((entry) => ({
        ...entry,
        forms: [{ form: `${entry.lemma}s`, formType: 'plural' as const }],
      })),
  );
  morphology.getInflectionsBatch = batch;
  dictionary.fetchEntry.mockImplementation(async (lemma) => {
    if (lemma === 'batch-surface')
      return {
        definitions: [],
        references: [
          {
            category: 'morphological_reference',
            source: lemma,
            sourcePos: PartOfSpeech.NOUN,
            targets: ['batch-one', 'batch-two'],
            targetPos: PartOfSpeech.NOUN,
            relationTypes: ['plural'],
            text: '',
          },
        ],
      };
    if (lemma === 'batch-one' || lemma === 'batch-two')
      return {
        definitions: [{ partOfSpeech: PartOfSpeech.NOUN, definition: lemma }],
        references: [],
      };
    return original(lemma);
  });
  await lookup('batch-surface');
  expect(batch).toHaveBeenCalledWith(
    expect.arrayContaining([
      { lemma: 'batch-one', partOfSpeech: 'noun' },
      { lemma: 'batch-two', partOfSpeech: 'noun' },
    ]),
    'en',
  );
  expect(await rows('batch-ones')).toContain('batch-one/noun/plural');
  expect(await rows('batch-twos')).toContain('batch-two/noun/plural');
  delete morphology.getInflectionsBatch;
  dictionary.fetchEntry.mockImplementation(original);
});
