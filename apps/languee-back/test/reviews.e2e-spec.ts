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

interface DeckApiResponse {
  id: string;
}

interface CardApiResponse {
  id: string;
}

interface SummaryApiResponse {
  dueCount: number;
  newCount: number;
}

interface QueueItemApiResponse {
  cardId: string;
  deckId: string;
  deckName: string;
  isNew: boolean;
  prompt: {
    definition: string;
    maskedSentence: string | null;
    partOfSpeech: string;
    kind: string;
    lemmaLength: number;
    language: string;
  };
}

interface QueueApiResponse {
  items: QueueItemApiResponse[];
}

interface AnswerApiResponse {
  result: 'correct' | 'incorrect';
  matchedForm: string | null;
  revealed: {
    lemma: string;
    ipa: string | null;
    inflectionForms: Record<string, string> | null;
  } | null;
}

interface GradeApiResponse {
  nextDueAt: string;
  intervalDays: number;
  state: 'learning' | 'review';
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
  example?: string,
): Promise<string> {
  mockAdapter.fetch.mockResolvedValueOnce([
    {
      partOfSpeech: PartOfSpeech.VERB,
      definition: definitionText,
      example: example ?? `Example sentence for ${word}.`,
    },
  ]);

  const res = await request(app.getHttpServer())
    .get(`/api/v1/dictionary/lookup?word=${word}`)
    .set('Authorization', `Bearer ${accessToken}`)
    .expect(200);

  return (res.body as LookupApiResponse).definitions[0].id;
}

async function createDeck(
  app: INestApplication<App>,
  accessToken: string,
  name: string,
): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/api/v1/decks')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ name })
    .expect(201);

  return (res.body as DeckApiResponse).id;
}

async function createCard(
  app: INestApplication<App>,
  accessToken: string,
  deckId: string,
  definitionId: string,
  context?: string,
): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/api/v1/cards')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ deckId, definitionId, context })
    .expect(201);

  return (res.body as CardApiResponse).id;
}

describe('ReviewsController (e2e)', () => {
  let app: INestApplication<App>;
  let accessToken: string;
  let otherAccessToken: string;
  let emptyAccessToken: string;
  let word: string;
  let cardId: string;
  let foreignCardId: string;

  const testEmail = `reviews-e2e-${Date.now()}@example.com`;
  const otherEmail = `reviews-e2e-other-${Date.now()}@example.com`;
  const emptyEmail = `reviews-e2e-empty-${Date.now()}@example.com`;
  const testPassword = 'Test1234!';

  beforeAll(async () => {
    app = await createApp();
    accessToken = await getAccessToken(app, testEmail, testPassword);
    otherAccessToken = await getAccessToken(app, otherEmail, testPassword);
    emptyAccessToken = await getAccessToken(app, emptyEmail, testPassword);

    word = randomWord('encounter');

    const definitionId = await seedDefinitionId(
      app,
      accessToken,
      word,
      'to meet or find unexpectedly',
      `I ${word} an old friend yesterday.`,
    );
    const deckId = await createDeck(
      app,
      accessToken,
      `reviews-e2e-deck-${Date.now()}`,
    );
    cardId = await createCard(
      app,
      accessToken,
      deckId,
      definitionId,
      `Guess who I ${word} at the station!`,
    );

    const otherWord = randomWord('otherword');
    const otherDefinitionId = await seedDefinitionId(
      app,
      otherAccessToken,
      otherWord,
      'an unrelated meaning',
    );
    const otherDeckId = await createDeck(
      app,
      otherAccessToken,
      `reviews-e2e-other-deck-${Date.now()}`,
    );
    foreignCardId = await createCard(
      app,
      otherAccessToken,
      otherDeckId,
      otherDefinitionId,
    );
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/v1/reviews/summary', () => {
    it('returns 401 when no Authorization header is provided', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/reviews/summary')
        .expect(401);
    });

    it('reports zero counts for a user with no cards', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/reviews/summary')
        .set('Authorization', `Bearer ${emptyAccessToken}`)
        .expect(200);

      expect(res.body as SummaryApiResponse).toEqual({
        dueCount: 0,
        newCount: 0,
      });
    });

    it('counts the seeded card as new', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/reviews/summary')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const body = res.body as SummaryApiResponse;
      expect(body.newCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('GET /api/v1/reviews/queue', () => {
    it('returns 401 when no Authorization header is provided', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/reviews/queue')
        .expect(401);
    });

    it('returns an empty queue for a user with no cards', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/reviews/queue')
        .set('Authorization', `Bearer ${emptyAccessToken}`)
        .expect(200);

      expect((res.body as QueueApiResponse).items).toEqual([]);
    });

    it('returns the seeded card as a new item with a masked prompt', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/reviews/queue')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const body = res.body as QueueApiResponse;
      const item = body.items.find((i) => i.cardId === cardId);
      expect(item).toBeDefined();
      expect(item?.isNew).toBe(true);
      expect(item?.prompt.maskedSentence).toBe(
        'Guess who I ____ at the station!',
      );
      expect(item?.prompt.language).toBe('en');
      expect(item?.prompt.kind).toBe('word');
      expect(item?.prompt.lemmaLength).toBe(word.length);
    });
  });

  describe('POST /api/v1/reviews/:cardId/answer', () => {
    it('returns 401 when no Authorization header is provided', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/reviews/${cardId}/answer`)
        .send({ typedAnswer: word })
        .expect(401);
    });

    it('returns correct with the matched form when the lemma is typed', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/reviews/${cardId}/answer`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ typedAnswer: word })
        .expect(200);

      expect(res.body as AnswerApiResponse).toEqual({
        result: 'correct',
        matchedForm: word,
        revealed: {
          lemma: word,
          ipa: null,
          inflectionForms: null,
        },
      });
    });

    it('returns incorrect when the typed answer matches nothing', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/reviews/${cardId}/answer`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ typedAnswer: 'totally-unrelated-answer' })
        .expect(200);

      expect(res.body as AnswerApiResponse).toEqual({
        result: 'incorrect',
        matchedForm: null,
        revealed: null,
      });
    });

    it('returns 400 for a blank typed answer', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/reviews/${cardId}/answer`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ typedAnswer: '   ' })
        .expect(400);
    });
  });

  describe('POST /api/v1/reviews/:cardId/grade', () => {
    it('returns 401 when no Authorization header is provided', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/reviews/${cardId}/grade`)
        .send({ rating: 'good' })
        .expect(401);
    });

    it('returns 404 when grading a card owned by another user', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/reviews/${foreignCardId}/grade`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ rating: 'good' })
        .expect(404);
    });

    it('grades "again" and schedules a short relearning delay', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/reviews/${cardId}/grade`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ rating: 'again', typedAnswer: word, answerResult: 'correct' })
        .expect(200);

      const body = res.body as GradeApiResponse;
      expect(body.state).toBe('learning');
      expect(body.intervalDays).toBe(0);
      expect(Number.isInteger(body.intervalDays)).toBe(true);
      expect(new Date(body.nextDueAt).getTime()).toBeGreaterThan(Date.now());
    });

    it('grades "hard" and keeps the card in learning (FSRS learning steps)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/reviews/${cardId}/grade`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ rating: 'hard' })
        .expect(200);

      const body = res.body as GradeApiResponse;
      expect(body.state).toBe('learning');
      expect(body.intervalDays).toBe(0);
      expect(new Date(body.nextDueAt).getTime()).toBeGreaterThan(Date.now());
    });

    it('grades "good" and keeps the card in learning until steps complete', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/reviews/${cardId}/grade`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ rating: 'good' })
        .expect(200);

      const body = res.body as GradeApiResponse;
      expect(body.state).toBe('learning');
      expect(body.intervalDays).toBe(0);
      expect(new Date(body.nextDueAt).getTime()).toBeGreaterThan(Date.now());
    });

    it('grades "easy" and extends the interval further', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/reviews/${cardId}/grade`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ rating: 'easy' })
        .expect(200);

      const body = res.body as GradeApiResponse;
      expect(body.state).toBe('review');
      expect(Number.isInteger(body.intervalDays)).toBe(true);
      expect(body.intervalDays).toBeGreaterThanOrEqual(1);
    });
  });

  describe('deck-agnostic scheduling', () => {
    it('a definition saved in two decks queues once and shares one schedule', async () => {
      const sharedWord = randomWord('shared');
      const definitionId = await seedDefinitionId(
        app,
        accessToken,
        sharedWord,
        'a meaning saved into two decks',
      );
      const deckAId = await createDeck(
        app,
        accessToken,
        `reviews-e2e-deck-a-${Date.now()}`,
      );
      const deckBId = await createDeck(
        app,
        accessToken,
        `reviews-e2e-deck-b-${Date.now()}`,
      );
      const cardAId = await createCard(
        app,
        accessToken,
        deckAId,
        definitionId,
        `I ${sharedWord} in two decks.`,
      );
      const cardBId = await createCard(app, accessToken, deckBId, definitionId);

      // Both cards share the definition, so the queue holds exactly one item.
      const queueRes = await request(app.getHttpServer())
        .get('/api/v1/reviews/queue')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const before = (queueRes.body as QueueApiResponse).items.filter((i) =>
        [cardAId, cardBId].includes(i.cardId),
      );
      expect(before).toHaveLength(1);

      // Grading through the other deck's card advances the shared schedule…
      await request(app.getHttpServer())
        .post(`/api/v1/reviews/${cardBId}/grade`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ rating: 'good' })
        .expect(200);

      // …so the definition stops being due through either card.
      const afterRes = await request(app.getHttpServer())
        .get('/api/v1/reviews/queue')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const after = (afterRes.body as QueueApiResponse).items.filter((i) =>
        [cardAId, cardBId].includes(i.cardId),
      );
      expect(after).toHaveLength(0);
    });
  });
});
