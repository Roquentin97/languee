import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { DEFINITION_API_ADAPTER } from '../src/modules/definitions/definitions.tokens';
import { ProviderUnavailableError } from '../src/modules/definitions/definitions.errors';
import type { IDefinitionApiAdapter } from '../src/modules/definitions/interfaces/definition-api-adapter.interface';

const MOCK_DEFINITIONS = [
  {
    partOfSpeech: 'preposition',
    definition: 'in spite of; without being affected by',
    example: 'He went out despite the rain.',
  },
];

const mockAdapter: jest.Mocked<IDefinitionApiAdapter> = {
  providerName: 'test-provider',
  fetch: jest.fn(),
};

async function createApp(): Promise<INestApplication<App>> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(DEFINITION_API_ADAPTER)
    .useValue(mockAdapter)
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
  // Register (ignore 409 if already exists)
  await request(app.getHttpServer())
    .post('/auth/register')
    .send({ email, password });

  const loginRes = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email, password });

  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  return loginRes.body.accessToken as string;
}

describe('DictionaryController (e2e)', () => {
  let app: INestApplication<App>;
  let accessToken: string;

  const testEmail = `dict-e2e-${Date.now()}@example.com`;
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
  });

  describe('GET /dictionary/lookup', () => {
    it('returns 401 when no Authorization header is provided', async () => {
      await request(app.getHttpServer())
        .get('/dictionary/lookup?word=despite')
        .expect(401);
    });

    it('returns 400 when word query param is missing', async () => {
      await request(app.getHttpServer())
        .get('/dictionary/lookup')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(400);
    });

    it('returns 200 with source=provider on first lookup (cache miss)', async () => {
      mockAdapter.fetch.mockResolvedValue(MOCK_DEFINITIONS);

      const res = await request(app.getHttpServer())
        .get('/dictionary/lookup?word=despite')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(res.body.source).toBe('provider');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(res.body.lemma).toBe('despite');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(res.body.definitions).toHaveLength(1);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockAdapter.fetch).toHaveBeenCalledTimes(1);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockAdapter.fetch).toHaveBeenCalledWith('despite', 'en');
    });

    it('returns 200 with source=cache on second lookup (cache hit, adapter not called again)', async () => {
      // Adapter already mocked from previous test; reset ensures it is not called
      mockAdapter.fetch.mockResolvedValue(MOCK_DEFINITIONS);

      const res = await request(app.getHttpServer())
        .get('/dictionary/lookup?word=despite')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(res.body.source).toBe('cache');
      // Adapter should not be called since word is in DB from previous test
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockAdapter.fetch).not.toHaveBeenCalled();
    });

    it('returns 502 when adapter throws ProviderUnavailableError', async () => {
      // Use a word that was never stored so cache miss is guaranteed
      const word = `unstored-${Date.now()}`;
      mockAdapter.fetch.mockRejectedValue(
        new ProviderUnavailableError('test-provider'),
      );

      await request(app.getHttpServer())
        .get(`/dictionary/lookup?word=${word}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(502);
    });
  });
});
