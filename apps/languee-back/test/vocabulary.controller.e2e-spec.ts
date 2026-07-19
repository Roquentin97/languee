import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { DICTIONARY_API_ADAPTER } from '../src/modules/dictionary/dictionary.tokens';
import type { IDictionaryApiAdapter } from '../src/modules/dictionary/interfaces/dictionary-api-adapter.interface';
import { NlpService } from '../src/modules/nlp/nlp.service';
import { PartOfSpeech } from '../src/modules/vocabulary/enums/part-of-speech.enum';

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

const mockNlpService: jest.Mocked<Pick<NlpService, 'analyze'>> = {
  analyze: jest.fn(),
};

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

  beforeAll(async () => {
    app = await createApp();
    accessToken = await getAccessToken(app, testEmail, testPassword);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    mockAdapter.fetch.mockReset();
    mockNlpService.analyze.mockReset();
  });

  describe('GET /api/v1/vocabulary/lookup — expression meta fields', () => {
    it('returns 401 when no Authorization header is provided', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/vocabulary/lookup?word=ran%20into')
        .expect(401);
    });

    it('returns 400 when the word exceeds 6 whitespace-separated tokens', async () => {
      await request(app.getHttpServer())
        .get(
          '/api/v1/vocabulary/lookup?word=one%20two%20three%20four%20five%20six%20seven',
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(400);
    });

    it('returns 200 with kind="word" and isExpression=false for a single-token word', async () => {
      mockNlpService.analyze.mockResolvedValue({
        kind: 'word',
        lemma: 'run',
        pos: PartOfSpeech.VERB,
        isIrregular: true,
        inflectionForms: null,
        extraForms: null,
      });
      mockAdapter.fetch.mockResolvedValue(MOCK_WORD_DEFINITIONS);

      const res = await request(app.getHttpServer())
        .get('/api/v1/vocabulary/lookup?word=running')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(res.body.kind).toBe('word');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(res.body.meta.isExpression).toBe(false);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(res.body.meta.providerMiss).toBe(false);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(res.body.meta.expressionContextFound).toBeNull();
      expect(mockNlpService.analyze).toHaveBeenCalledTimes(1);
    });

    it('returns 200 with language="es" echoed back for a Spanish word lookup', async () => {
      mockNlpService.analyze.mockResolvedValue({
        kind: 'word',
        lemma: 'correr',
        pos: PartOfSpeech.VERB,
        isIrregular: false,
        inflectionForms: null,
        extraForms: { indicative_present_yo: 'corro' },
      });
      mockAdapter.fetch.mockResolvedValue(MOCK_WORD_DEFINITIONS);

      const res = await request(app.getHttpServer())
        .get('/api/v1/vocabulary/lookup?word=corro&language=es')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(res.body.language).toBe('es');
      expect(mockNlpService.analyze).toHaveBeenCalledWith(
        'corro',
        undefined,
        'es',
      );
    });

    it('returns 200 with expression meta fields for a 2-token word', async () => {
      mockNlpService.analyze.mockResolvedValue({
        kind: 'phrasal_verb',
        canonical: 'run into',
        headLemma: 'run',
        contextMatch: null,
      });
      mockAdapter.fetch.mockResolvedValue(MOCK_EXPRESSION_DEFINITIONS);

      const res = await request(app.getHttpServer())
        .get('/api/v1/vocabulary/lookup?word=ran%20into')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(res.body.lemma).toBe('run into');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(res.body.kind).toBe('phrasal_verb');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(res.body.partOfSpeech).toBeNull();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(res.body.meta.isExpression).toBe(true);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(res.body.meta.filteredByPos).toBe(false);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(res.body.meta.providerMiss).toBe(false);
      expect(mockNlpService.analyze).toHaveBeenCalledTimes(1);
    });

    it('returns providerMiss=true with empty definitions when the dictionary provider has no entry for the expression', async () => {
      mockNlpService.analyze.mockResolvedValue({
        kind: 'expression',
        canonical: 'kick the bucket',
        headLemma: 'kick',
        contextMatch: null,
      });
      mockAdapter.fetch.mockResolvedValue([]);

      const res = await request(app.getHttpServer())
        .get('/api/v1/vocabulary/lookup?word=kick%20the%20bucket')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(res.body.definitions).toEqual([]);
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
          kind: 'word',
          definition: 'to move fast',
          partOfSpeech: PartOfSpeech.VERB,
        })
        .expect(401);
    });

    it('returns 400 when required fields are missing', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/vocabulary/definitions')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ kind: 'word' })
        .expect(400);
    });

    it('returns 400 when kind="word" is missing partOfSpeech', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/vocabulary/definitions')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          text: `solo-${Date.now()}`,
          kind: 'word',
          definition: 'a made-up test word',
        })
        .expect(400);
    });

    it('returns 201 with the created definition shape for kind="word"', async () => {
      const word = `soloword${Date.now()}`;

      const res = await request(app.getHttpServer())
        .post('/api/v1/vocabulary/definitions')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          text: word,
          kind: 'word',
          definition: 'a made-up test definition',
          partOfSpeech: PartOfSpeech.NOUN,
        })
        .expect(201);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(res.body.lemma).toBe(word);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(res.body.kind).toBe('word');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(res.body.partOfSpeech).toBe(PartOfSpeech.NOUN);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(res.body.definition).toBe('a made-up test definition');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(res.body.provider).toBe('user');
      expect(mockNlpService.analyze).not.toHaveBeenCalled();
    });

    it('returns 201 with the created definition shape for kind="phrasal_verb", using the NLP-derived canonical and kind', async () => {
      mockNlpService.analyze.mockResolvedValue({
        kind: 'expression',
        canonical: `phony phrase ${Date.now()}`,
        headLemma: 'phony',
        contextMatch: null,
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/vocabulary/definitions')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          text: 'phony phrase input',
          kind: 'phrasal_verb',
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
      const body = {
        text: word,
        kind: 'word',
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
