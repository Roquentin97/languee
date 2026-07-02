import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { DICTIONARY_API_ADAPTER } from '../src/modules/dictionary/dictionary.tokens';
import type { IDictionaryApiAdapter } from '../src/modules/dictionary/interfaces/dictionary-api-adapter.interface';
import { PartOfSpeech } from '../src/modules/vocabulary/enums/part-of-speech.enum';

interface LoginApiResponse {
  accessToken: string;
}

interface LookupApiResponse {
  definitions: Array<{ id: string }>;
}

interface MeaningLinkApiResponse {
  id: string;
  relationType: string;
  source: string;
  definitionA: { id: string; lemma: string };
  definitionB: { id: string; lemma: string };
}

interface MeaningLinkListApiResponse {
  links: Array<{ id: string; linked: { definitionId: string } }>;
}

interface OverlapsApiResponse {
  overlaps: Array<{
    definitionId: string;
    linkedDefinitionId: string;
    relationType: string;
    decks: Array<{ id: string; name: string }>;
  }>;
}

interface DeckApiResponse {
  id: string;
}

const mockAdapter: jest.Mocked<IDictionaryApiAdapter> = {
  providerName: 'test-provider',
  fetch: jest.fn(),
};

async function createApp(): Promise<INestApplication<App>> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(DICTIONARY_API_ADAPTER)
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
  await request(app.getHttpServer())
    .post('/auth/register')
    .send({ email, password });

  const loginRes = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email, password });

  return (loginRes.body as LoginApiResponse).accessToken;
}

function randomWord(prefix: string): string {
  const suffix = Math.random()
    .toString(36)
    .replace(/[^a-z]/g, '');
  return `${prefix}${suffix}`;
}

async function seedDefinitionId(
  app: INestApplication<App>,
  accessToken: string,
  word: string,
  definitionText: string,
): Promise<string> {
  mockAdapter.fetch.mockResolvedValueOnce([
    {
      partOfSpeech: PartOfSpeech.VERB,
      definition: definitionText,
      example: `Example sentence for ${word}.`,
    },
  ]);

  const res = await request(app.getHttpServer())
    .get(`/api/v1/dictionary/lookup?word=${word}`)
    .set('Authorization', `Bearer ${accessToken}`)
    .expect(200);

  return (res.body as LookupApiResponse).definitions[0].id;
}

describe('SynonymsController (e2e)', () => {
  let app: INestApplication<App>;
  let accessToken: string;
  let defA: string;
  let defB: string;
  let defC: string;
  let linkId: string;

  const testEmail = `synonyms-e2e-${Date.now()}@example.com`;
  const testPassword = 'Test1234!';

  beforeAll(async () => {
    app = await createApp();
    accessToken = await getAccessToken(app, testEmail, testPassword);

    defA = await seedDefinitionId(
      app,
      accessToken,
      randomWord('alpha'),
      'to move quickly on foot',
    );
    defB = await seedDefinitionId(
      app,
      accessToken,
      randomWord('beta'),
      'to run at high speed',
    );
    defC = await seedDefinitionId(
      app,
      accessToken,
      randomWord('gamma'),
      'an unrelated meaning',
    );
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/v1/synonyms', () => {
    it('returns 401 when no Authorization header is provided', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/synonyms')
        .send({
          definitionAId: defA,
          definitionBId: defB,
          relationType: 'synonym',
        })
        .expect(401);
    });

    it('creates a meaning link and returns both definitions (201)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/synonyms')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          definitionAId: defA,
          definitionBId: defB,
          relationType: 'synonym',
        })
        .expect(201);

      const body = res.body as MeaningLinkApiResponse;
      expect(body.relationType).toBe('synonym');
      expect(body.source).toBe('user');
      expect([body.definitionA.id, body.definitionB.id].sort()).toEqual(
        [defA, defB].sort(),
      );
      linkId = body.id;
    });

    it('returns 400 when linking a definition to itself', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/synonyms')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          definitionAId: defA,
          definitionBId: defA,
          relationType: 'synonym',
        })
        .expect(400);
    });

    it('returns 404 when a definition id does not exist', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/synonyms')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          definitionAId: defA,
          definitionBId: '00000000-0000-4000-8000-000000000000',
          relationType: 'synonym',
        })
        .expect(404);
    });

    it('returns 409 when the same pair and relation type already exists', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/synonyms')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          definitionAId: defA,
          definitionBId: defB,
          relationType: 'synonym',
        })
        .expect(409);
    });
  });

  describe('GET /api/v1/synonyms/definition/:definitionId', () => {
    it('returns 401 when no Authorization header is provided', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/synonyms/definition/${defA}`)
        .expect(401);
    });

    it('returns links with the counterpart definition presented as "linked"', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/synonyms/definition/${defA}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const body = res.body as MeaningLinkListApiResponse;
      const found = body.links.find((link) => link.id === linkId);
      expect(found).toBeDefined();
      expect(found?.linked.definitionId).toBe(defB);
    });

    it('returns an empty array for a definition with no links', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/synonyms/definition/${defC}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect((res.body as MeaningLinkListApiResponse).links).toEqual([]);
    });
  });

  describe('GET /api/v1/synonyms/overlaps', () => {
    it('returns 401 when no Authorization header is provided', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/synonyms/overlaps?definitionIds=${defA}`)
        .expect(401);
    });

    it('returns 400 for an invalid uuid in definitionIds', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/synonyms/overlaps?definitionIds=not-a-uuid')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(400);
    });

    it('returns the linked definition with deck info once the user has a card for it', async () => {
      const deckRes = await request(app.getHttpServer())
        .post('/api/v1/decks')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: `synonyms-e2e-deck-${Date.now()}` })
        .expect(201);
      const deckId = (deckRes.body as DeckApiResponse).id;

      await request(app.getHttpServer())
        .post('/api/v1/cards')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ deckId, definitionId: defB })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/synonyms/overlaps?definitionIds=${defA}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const body = res.body as OverlapsApiResponse;
      expect(body.overlaps).toHaveLength(1);
      expect(body.overlaps[0]).toMatchObject({
        definitionId: defA,
        linkedDefinitionId: defB,
        relationType: 'synonym',
      });
      expect(body.overlaps[0]?.decks.map((d) => d.id)).toContain(deckId);
    });

    it('returns an empty overlaps array when the definition has no linked cards', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/synonyms/overlaps?definitionIds=${defC}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect((res.body as OverlapsApiResponse).overlaps).toEqual([]);
    });
  });

  describe('DELETE /api/v1/synonyms/:id', () => {
    it('returns 401 when no Authorization header is provided', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/synonyms/${linkId}`)
        .expect(401);
    });

    it('deletes the meaning link (204)', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/synonyms/${linkId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);
    });

    it('returns 404 when the link no longer exists', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/synonyms/${linkId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });
});
