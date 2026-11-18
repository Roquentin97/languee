import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import type { Redis } from 'ioredis';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { DICTIONARY_API_ADAPTER } from '../src/modules/lexicon/enrichment/dictionary/dictionary.tokens';
import type { IDictionaryApiAdapter } from '../src/modules/lexicon/enrichment/dictionary/interfaces/dictionary-api-adapter.interface';
import { NlpService } from '../src/modules/lexicon/enrichment/nlp/nlp.service';
import { PrismaService } from '../src/modules/system/core/prisma/prisma.service';
import { PartOfSpeech } from '../src/modules/lexicon/types/part-of-speech.enum';

const MOCK_WORD_DEFINITIONS = [
  {
    partOfSpeech: PartOfSpeech.VERB,
    definition: 'to move at a speed faster than a walk',
    example: 'She runs every morning.',
  },
];

const MOCK_EXPRESSION_DEFINITIONS = [
  {
    partOfSpeech: PartOfSpeech.VERB,
    definition: 'to encounter someone or something unexpectedly',
    example: 'I ran into an old friend.',
  },
];

const mockAdapter: jest.Mocked<IDictionaryApiAdapter> = {
  providerName: 'test-provider',
  fetch: jest.fn(),
};

const mockNlpService: jest.Mocked<
  Pick<
    NlpService,
    'analyze' | 'findLemmaCandidates' | 'getInflections' | 'getInflectionsBatch'
  >
> = {
  analyze: jest.fn(),
  findLemmaCandidates: jest.fn().mockResolvedValue([]),
  getInflections: jest.fn().mockResolvedValue([]),
  getInflectionsBatch: jest
    .fn()
    .mockImplementation(
      (entries: Array<{ lemma: string; partOfSpeech: PartOfSpeech }>) =>
        Promise.resolve(entries.map((entry) => ({ ...entry, forms: [] }))),
    ),
};

function alphaNonce(): string {
  return [...String(Date.now())]
    .map((digit) => String.fromCharCode(97 + Number(digit)))
    .join('');
}

async function createApp(): Promise<INestApplication<App>> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(DICTIONARY_API_ADAPTER)
    .useValue(mockAdapter)
    .overrideProvider(NlpService)
    .useValue(mockNlpService)
    .compile();

  const app = moduleFixture.createNestApplication<INestApplication<App>>();
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
  );
  await app.init();
  return app;
}

async function getAccessToken(
  app: INestApplication<App>,
  email: string,
  password: string,
): Promise<string> {
  await request(app.getHttpServer())
    .post('/auth/register')
    .send({ email, password });

  const loginRes = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email, password });

  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  return loginRes.body.accessToken as string;
}

describe('VocabularyController (e2e)', () => {
  let app: INestApplication<App>;
  let accessToken: string;

  const testEmail = `vocab-e2e-${Date.now()}@example.com`;
  const testPassword = 'Test1234!';
  const fixtureTerms = new Set<string>();

  beforeAll(async () => {
    app = await createApp();
    accessToken = await getAccessToken(app, testEmail, testPassword);
  });

  afterAll(async () => {
    const prisma = app.get(PrismaService);
    const redis = app.get<Redis>('REDIS_CLIENT');
    try {
      const user = await prisma.user.findUnique({
        where: { email: testEmail },
      });
      if (user) {
        const lookups = await prisma.evalLexicalLookup.findMany({
          where: { userId: user.id },
          select: { id: true },
        });
        const lookupIds = lookups.map(({ id }) => id);
        if (lookupIds.length) {
          await prisma.evalLexicalLearnerChoice.deleteMany({
            where: { lookupId: { in: lookupIds } },
          });
          await prisma.evalLexicalDictionaryDisagreement.deleteMany({
            where: { lookupId: { in: lookupIds } },
          });
        }
        await prisma.evalLexicalLookup.deleteMany({
          where: { userId: user.id },
        });
        const sessionKey = `user_sessions:${user.id}`;
        const sessionIds = await redis.smembers(sessionKey);
        if (sessionIds.length)
          await redis.del(...sessionIds.map((id) => `session:${id}`));
        await redis.del(sessionKey);
        await prisma.user.delete({ where: { id: user.id } });
      }

      const entries = await prisma.lexicalEntry.findMany({
        where: { language: 'en', lemma: { in: [...fixtureTerms] } },
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
        await prisma.lexicalEntry.deleteMany({
          where: { id: { in: entryIds } },
        });
      }
      await prisma.lookupState.deleteMany({
        where: { language: 'en', term: { in: [...fixtureTerms] } },
      });
    } finally {
      await app.close();
      redis.disconnect();
      await prisma.$disconnect();
    }
  });

  beforeEach(() => {
    mockAdapter.fetch.mockReset();
    mockNlpService.analyze.mockReset();
  });

  describe('POST /api/v1/vocabulary/lookup — expression meta fields', () => {
    it('returns 401 when no Authorization header is provided', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/vocabulary/lookup')
        .send({ text: 'ran into' })
        .expect(401);
    });

    it('removes the previous GET lookup contract', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/vocabulary/lookup?text=run')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });

    it('rejects lookup text with more than six whitespace-separated components', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/vocabulary/lookup')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          text: 'one two three four five six seven',
        })
        .expect(400);

      expect(mockNlpService.analyze).not.toHaveBeenCalled();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(res.body.message).toBe('INPUT_INVALID');
    });

    it('allows six whitespace-separated components including punctuation-linked words', async () => {
      const text = `don't state-of-the-art one two three ${Date.now()}`;
      fixtureTerms.add(text);
      mockNlpService.analyze.mockResolvedValue({
        kind: 'expression',
        canonical: text,
        headLemma: "don't",
        contextMatch: null,
        modelVersion: 'en_test@fixture',
      });
      mockAdapter.fetch.mockResolvedValue(MOCK_WORD_DEFINITIONS);

      await request(app.getHttpServer())
        .post('/api/v1/vocabulary/lookup')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ text })
        .expect(200);

      expect(mockNlpService.analyze).toHaveBeenCalledTimes(1);
    });

    it('returns 200 with kind="word" and isExpression=false for a single-token word', async () => {
      const text = `vocabword${Date.now()}`;
      fixtureTerms.add(text);
      mockNlpService.analyze.mockResolvedValue({
        kind: 'word',
        lemma: text,
        pos: PartOfSpeech.VERB,
        isIrregular: true,
        inflectionForms: null,
        modelVersion: 'en_test@fixture',
      });
      mockAdapter.fetch.mockResolvedValue(MOCK_WORD_DEFINITIONS);

      const res = await request(app.getHttpServer())
        .post('/api/v1/vocabulary/lookup')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ text })
        .expect(200);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(res.body.kind).toBe('word');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(res.body.preferred).toBeNull();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(res.body.headwords[0]).toHaveProperty('entryId');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(res.body.meta.isExpression).toBe(false);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(res.body.meta.providerMiss).toBe(false);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(res.body.meta.expressionContextFound).toBeNull();
      expect(mockNlpService.analyze).toHaveBeenCalledTimes(1);
    });

    it('accepts a selected occurrence as code-point ranges in the POST body', async () => {
      const text = `vocabselection${alphaNonce()}`;
      const context = `I ${text} the ${text}.`;
      const firstStart = context.indexOf(text);
      const firstRange = { start: firstStart, end: firstStart + text.length };
      const secondStart = context.lastIndexOf(text);
      const secondRange = {
        start: secondStart,
        end: secondStart + text.length,
      };
      fixtureTerms.add(text);
      mockNlpService.analyze.mockResolvedValue({
        kind: 'word',
        lemma: text,
        pos: PartOfSpeech.VERB,
        isIrregular: true,
        inflectionForms: null,
        modelVersion: 'en_test@fixture',
      });
      mockAdapter.fetch.mockResolvedValue(MOCK_WORD_DEFINITIONS);

      const response = await request(app.getHttpServer())
        .post('/api/v1/vocabulary/lookup')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          text,
          language: 'en',
          context,
          selectionRanges: [secondRange],
          includeSuggestions: false,
        })
        .expect(200);

      expect(mockNlpService.analyze).toHaveBeenCalledWith(text, context, 'en', [
        secondRange,
      ]);
      expect(firstRange).not.toEqual(secondRange);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(response.body.alternatives).toEqual([]);
    });

    it('rejects partial or malformed selected ranges before NLP is called', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/vocabulary/lookup')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          text: 'saw',
          context: 'I saw the saw.',
          selectionRanges: [{ start: 3, end: 5 }],
        })
        .expect(400);

      expect(mockNlpService.analyze).not.toHaveBeenCalled();
    });

    it('returns 200 with expression meta fields for a 2-token word', async () => {
      const canonical = `run into ${Date.now()}`;
      fixtureTerms.add(canonical);
      mockNlpService.analyze.mockResolvedValue({
        kind: 'phrasal_verb',
        canonical,
        headLemma: 'run',
        contextMatch: null,
        modelVersion: 'en_test@fixture',
      });
      mockAdapter.fetch.mockResolvedValue(MOCK_EXPRESSION_DEFINITIONS);

      const res = await request(app.getHttpServer())
        .post('/api/v1/vocabulary/lookup')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ text: 'ran into' })
        .expect(200);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(res.body.meta.analyzedLemma).toBe(canonical);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(res.body.kind).toBe('phrasal_verb');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(res.body.preferred.partOfSpeech).toBeNull();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(res.body.meta.isExpression).toBe(true);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(res.body.meta.filteredByPos).toBe(false);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(res.body.meta.providerMiss).toBe(false);
      expect(mockNlpService.analyze).toHaveBeenCalledTimes(1);
    });

    it('returns providerMiss=true with empty definitions when the dictionary provider has no entry for the expression', async () => {
      const canonical = `kick the bucket ${Date.now()}`;
      fixtureTerms.add(canonical);
      mockNlpService.analyze.mockResolvedValue({
        kind: 'expression',
        canonical,
        headLemma: 'kick',
        contextMatch: null,
        modelVersion: 'en_test@fixture',
      });
      mockAdapter.fetch.mockResolvedValue([]);

      const res = await request(app.getHttpServer())
        .post('/api/v1/vocabulary/lookup')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ text: 'kick the bucket' })
        .expect(200);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(res.body.headwords).toEqual([]);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(res.body.meta.providerMiss).toBe(true);
    });
  });

  describe('POST /api/v1/vocabulary/definitions', () => {
    it('returns 401 when no Authorization header is provided', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/vocabulary/definitions')
        .send({
          text: 'run',
          definition: 'to move fast',
          partOfSpeech: PartOfSpeech.VERB,
        })
        .expect(401);
    });

    it('returns 400 when required fields are missing', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/vocabulary/definitions')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ definition: 'no text supplied' })
        .expect(400);
    });

    it('returns 400 when a single word is missing partOfSpeech', async () => {
      const word = `solo${Date.now()}`;
      fixtureTerms.add(word);
      mockNlpService.analyze.mockResolvedValue({
        kind: 'word',
        lemma: word,
        pos: PartOfSpeech.NOUN,
        isIrregular: false,
        inflectionForms: null,
        modelVersion: 'en_test@fixture',
      });

      await request(app.getHttpServer())
        .post('/api/v1/vocabulary/definitions')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          text: word,
          definition: 'a made-up test word',
        })
        .expect(400);
    });

    it('returns 201 with the created definition shape for a single word', async () => {
      const word = `soloword${Date.now()}`;
      fixtureTerms.add(word);
      mockNlpService.analyze.mockResolvedValue({
        kind: 'word',
        lemma: word,
        pos: PartOfSpeech.NOUN,
        isIrregular: false,
        inflectionForms: null,
        modelVersion: 'en_test@fixture',
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/vocabulary/definitions')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          text: word,
          definition: 'a made-up test definition',
          partOfSpeech: PartOfSpeech.NOUN,
        })
        .expect(201);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(res.body.lemma).toBe(word);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(res.body.kind).toBe('word');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(res.body.entryId).toEqual(expect.any(String));
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(res.body).not.toHaveProperty('wordId');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(res.body.partOfSpeech).toBe(PartOfSpeech.NOUN);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(res.body.definition).toBe('a made-up test definition');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(res.body.provider).toBe('user');
      expect(mockNlpService.analyze).toHaveBeenCalled();
    });

    it('returns 201 with the created definition shape for an expression, using the NLP-derived canonical and kind', async () => {
      const canonical = `phony phrase ${Date.now()}`;
      fixtureTerms.add(canonical);
      mockNlpService.analyze.mockResolvedValue({
        kind: 'expression',
        canonical,
        headLemma: 'phony',
        contextMatch: null,
        modelVersion: 'en_test@fixture',
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/vocabulary/definitions')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          text: 'phony phrase input',
          definition: 'a made-up test expression definition',
        })
        .expect(201);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(res.body.kind).toBe('expression');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(res.body.partOfSpeech).toBe(PartOfSpeech.PHRASE);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(res.body.provider).toBe('user');
    });

    it('returns 409 when the same word/partOfSpeech/definition already exists', async () => {
      const word = `dupword${Date.now()}`;
      fixtureTerms.add(word);
      mockNlpService.analyze.mockResolvedValue({
        kind: 'word',
        lemma: word,
        pos: PartOfSpeech.ADJECTIVE,
        isIrregular: false,
        inflectionForms: null,
        modelVersion: 'en_test@fixture',
      });
      const body = {
        text: word,
        definition: 'duplicate test definition',
        partOfSpeech: PartOfSpeech.ADJECTIVE,
      };

      await request(app.getHttpServer())
        .post('/api/v1/vocabulary/definitions')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(body)
        .expect(201);

      await request(app.getHttpServer())
        .post('/api/v1/vocabulary/definitions')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(body)
        .expect(409);
    });
  });
});
