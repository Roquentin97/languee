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

interface CardResponse {
  id: string;
  type: 'existing' | 'inflection' | 'definition';
}

interface CreateCardsApiResponse {
  cards: CardResponse[];
}

interface SummaryApiResponse {
  dueCount: number;
  newCount: number;
}

interface QueueItemApiResponse {
  cardId: string;
  type: 'existing' | 'inflection' | 'definition';
  decks: Array<{ id: string; name: string }>;
  isNew: boolean;
  existing: {
    definition: string;
    maskedSentence: string | null;
    partOfSpeech: string;
    kind: string;
    lemmaLength: number;
    language: string;
  } | null;
  inflection: {
    lemma: string;
    partOfSpeech: string;
    kind: string;
    language: string;
    formKeys: string[];
  } | null;
  definition: {
    lemma: string;
    partOfSpeech: string;
    kind: string;
    language: string;
    hint1: string[] | null;
    hint2: string | null;
  } | null;
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
  state: 'learning' | 'review' | 'relearning';
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

/** Saves a definition into a deck and returns every card generated. */
async function saveToDeck(
  app: INestApplication<App>,
  accessToken: string,
  deckId: string,
  definitionId: string,
  context?: string,
): Promise<CardResponse[]> {
  const res = await request(app.getHttpServer())
    .post('/api/v1/cards')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ deckId, definitionId, context })
    .expect(201);

  return (res.body as CreateCardsApiResponse).cards;
}

function existingCardId(cards: CardResponse[]): string {
  const card = cards.find((c) => c.type === 'existing');
  if (!card) throw new Error('no existing card in response');
  return card.id;
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
    const cards = await saveToDeck(
      app,
      accessToken,
      deckId,
      definitionId,
      `Guess who I ${word} at the station!`,
    );
    cardId = existingCardId(cards);

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
    const foreignCards = await saveToDeck(
      app,
      otherAccessToken,
      otherDeckId,
      otherDefinitionId,
    );
    foreignCardId = existingCardId(foreignCards);
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

    it('counts the seeded cards as new', async () => {
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

    it('returns the seeded existing card as a new item with a masked prompt', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/reviews/queue')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const body = res.body as QueueApiResponse;
      const item = body.items.find((i) => i.cardId === cardId);
      expect(item).toBeDefined();
      expect(item?.type).toBe('existing');
      expect(item?.isNew).toBe(true);
      expect(item?.existing?.maskedSentence).toBe(
        `Guess who I ____ at the station!`,
      );
      expect(item?.existing?.language).toBe('en');
      expect(item?.existing?.kind).toBe('word');
      expect(item?.existing?.lemmaLength).toBe(word.length);
    });

    it('also queues a definition card for the same saved sense', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/reviews/queue')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const body = res.body as QueueApiResponse;
      const item = body.items.find((i) => i.type === 'definition');
      expect(item).toBeDefined();
      expect(item?.definition?.lemma).toBe(word);
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

  describe('POST /api/v1/reviews/:cardId/check-forms', () => {
    it('returns 400 when the card is not an inflection card', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/reviews/${cardId}/check-forms`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ typedForms: { base: word } })
        .expect(400);
    });

    it('returns 404 for an unknown card', async () => {
      await request(app.getHttpServer())
        .post(
          '/api/v1/reviews/00000000-0000-4000-8000-000000000000/check-forms',
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ typedForms: { base: word } })
        .expect(404);
    });
  });

  describe('deck-agnostic scheduling', () => {
    it('saving the same definition into a second deck reuses the same card and schedule', async () => {
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
      const cardsA = await saveToDeck(
        app,
        accessToken,
        deckAId,
        definitionId,
        `I ${sharedWord} in two decks.`,
      );
      const cardsB = await saveToDeck(app, accessToken, deckBId, definitionId);
      const cardAId = existingCardId(cardsA);
      const cardBId = existingCardId(cardsB);

      // Same underlying card, reused across decks - not duplicated.
      expect(cardAId).toBe(cardBId);

      const queueRes = await request(app.getHttpServer())
        .get('/api/v1/reviews/queue')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const before = (queueRes.body as QueueApiResponse).items.filter(
        (i) => i.cardId === cardAId,
      );
      expect(before).toHaveLength(1);
      expect(before[0]?.decks.map((d) => d.id).sort()).toEqual(
        [deckAId, deckBId].sort(),
      );

      // Grading advances the single shared schedule…
      await request(app.getHttpServer())
        .post(`/api/v1/reviews/${cardAId}/grade`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ rating: 'good' })
        .expect(200);

      // …so the card stops being due through either deck.
      const afterRes = await request(app.getHttpServer())
        .get('/api/v1/reviews/queue')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const after = (afterRes.body as QueueApiResponse).items.filter(
        (i) => i.cardId === cardAId,
      );
      expect(after).toHaveLength(0);
    });

    it('re-saving the exact same deck + definition returns 409', async () => {
      const sharedWord = randomWord('dupe');
      const definitionId = await seedDefinitionId(
        app,
        accessToken,
        sharedWord,
        'a meaning saved twice into the same deck',
      );
      const deckId = await createDeck(
        app,
        accessToken,
        `reviews-e2e-dupe-deck-${Date.now()}`,
      );
      await saveToDeck(app, accessToken, deckId, definitionId);

      await request(app.getHttpServer())
        .post('/api/v1/cards')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ deckId, definitionId })
        .expect(409);
    });
  });
});
