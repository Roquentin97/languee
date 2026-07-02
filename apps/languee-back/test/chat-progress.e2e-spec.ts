import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { ChatAnalysisService } from '../src/modules/chat/chat-analysis.service';
import { ChatProgressService } from '../src/modules/chat/chat-progress.service';

interface LoginApiResponse {
  accessToken: string;
}

interface ConversationApiResponse {
  id: string;
}

interface ProgressTotalsApiResponse {
  suggestionsRaised: number;
  suggestionsResolved: number;
  resolutionRate: number | null;
  userMessages: number;
  activeConversations: number;
}

interface ProgressByTypeApiResponse {
  type: 'overused_word' | 'grammar' | 'style';
  raised: number;
  resolved: number;
}

interface ProgressWeekApiResponse {
  weekStart: string;
  raised: number;
  resolved: number;
  userMessages: number;
}

interface ProgressApiResponse {
  totals: ProgressTotalsApiResponse;
  byType: ProgressByTypeApiResponse[];
  weeks: ProgressWeekApiResponse[];
  computedAt: string | null;
}

async function createApp(): Promise<INestApplication<App>> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

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

function getUserIdFromAccessToken(accessToken: string): string {
  const payloadSegment = accessToken.split('.')[1];
  const payload = JSON.parse(
    Buffer.from(payloadSegment, 'base64').toString('utf8'),
  ) as { sub: string };
  return payload.sub;
}

describe('ChatProgressController (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/v1/chat/progress', () => {
    it('returns 401 when no Authorization header is provided', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/chat/progress')
        .expect(401);
    });

    it('returns the empty-state shape for a fresh user with no chat activity', async () => {
      const email = `progress-e2e-empty-${Date.now()}@example.com`;
      const accessToken = await getAccessToken(app, email, 'Test1234!');

      const res = await request(app.getHttpServer())
        .get('/api/v1/chat/progress')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const body = res.body as ProgressApiResponse;
      expect(body.totals).toEqual({
        suggestionsRaised: 0,
        suggestionsResolved: 0,
        resolutionRate: null,
        userMessages: 0,
        activeConversations: 0,
      });
      expect(body.byType).toEqual([
        { type: 'overused_word', raised: 0, resolved: 0 },
        { type: 'grammar', raised: 0, resolved: 0 },
        { type: 'style', raised: 0, resolved: 0 },
      ]);
      expect(body.weeks).toEqual([]);
      expect(body.computedAt).toBeNull();
    });

    it('returns a non-empty shape after posting messages and running analysis + recompute directly', async () => {
      const email = `progress-e2e-active-${Date.now()}@example.com`;
      const accessToken = await getAccessToken(app, email, 'Test1234!');

      const conversationRes = await request(app.getHttpServer())
        .post('/api/v1/chat/conversations')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({})
        .expect(201);
      const conversationId = (conversationRes.body as ConversationApiResponse)
        .id;

      const overusedWord = 'basically';
      const filler = Array(60).fill('the').join(' ');
      await request(app.getHttpServer())
        .post(`/api/v1/chat/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          content: `${overusedWord} ${overusedWord} ${overusedWord} said i. ${filler}`,
        })
        .expect(201);

      const analysisService = app.get(ChatAnalysisService);
      const progressService = app.get(ChatProgressService);
      await analysisService.analyzeConversation(conversationId);
      await progressService.recomputeForUser(
        getUserIdFromAccessToken(accessToken),
      );

      const res = await request(app.getHttpServer())
        .get('/api/v1/chat/progress')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const body = res.body as ProgressApiResponse;
      expect(body.totals.activeConversations).toBe(1);
      expect(body.totals.userMessages).toBeGreaterThanOrEqual(1);
      expect(body.totals.suggestionsRaised).toBeGreaterThan(0);
      expect(Array.isArray(body.weeks)).toBe(true);
      expect(body.computedAt).toEqual(expect.any(String));
    });
  });
});
