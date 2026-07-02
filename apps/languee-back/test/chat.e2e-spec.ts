import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { ChatAnalysisService } from '../src/modules/chat/chat-analysis.service';

interface LoginApiResponse {
  accessToken: string;
}

interface ConversationApiResponse {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

interface ConversationListApiResponse {
  conversations: Array<
    ConversationApiResponse & { lastMessagePreview: string | null }
  >;
}

interface MessageApiResponse {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

interface ConversationDetailApiResponse {
  id: string;
  title: string | null;
  createdAt: string;
  messages: MessageApiResponse[];
}

interface PostMessageApiResponse {
  userMessage: MessageApiResponse;
  assistantMessage: MessageApiResponse;
}

interface SuggestionApiResponse {
  id: string;
  type: 'overused_word' | 'grammar' | 'style';
  title: string;
  detail: string;
  payload: Record<string, unknown> | null;
  createdAt: string;
}

interface SuggestionsApiResponse {
  suggestions: SuggestionApiResponse[];
  analyzedAt: string | null;
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

describe('ChatController (e2e)', () => {
  let app: INestApplication<App>;
  let accessToken: string;
  let otherAccessToken: string;
  let conversationId: string;
  let foreignConversationId: string;

  const testEmail = `chat-e2e-${Date.now()}@example.com`;
  const otherEmail = `chat-e2e-other-${Date.now()}@example.com`;
  const testPassword = 'Test1234!';

  beforeAll(async () => {
    app = await createApp();
    accessToken = await getAccessToken(app, testEmail, testPassword);
    otherAccessToken = await getAccessToken(app, otherEmail, testPassword);

    const foreignRes = await request(app.getHttpServer())
      .post('/api/v1/chat/conversations')
      .set('Authorization', `Bearer ${otherAccessToken}`)
      .send({})
      .expect(201);
    foreignConversationId = (foreignRes.body as ConversationApiResponse).id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/v1/chat/conversations', () => {
    it('returns 401 when no Authorization header is provided', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/chat/conversations')
        .send({ title: 'Practice' })
        .expect(401);
    });

    it('creates a conversation with a title', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/chat/conversations')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ title: 'Practicing small talk' })
        .expect(201);

      const body = res.body as ConversationApiResponse;
      expect(body.id).toEqual(expect.any(String));
      expect(body.title).toBe('Practicing small talk');
      expect(body.messageCount).toBe(0);

      conversationId = body.id;
    });

    it('creates a conversation without a title (null)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/chat/conversations')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({})
        .expect(201);

      expect((res.body as ConversationApiResponse).title).toBeNull();
    });

    it('returns 400 for a title longer than 80 characters', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/chat/conversations')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ title: 'x'.repeat(81) })
        .expect(400);
    });
  });

  describe('GET /api/v1/chat/conversations', () => {
    it('returns 401 when no Authorization header is provided', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/chat/conversations')
        .expect(401);
    });

    it('lists conversations for the current user', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/chat/conversations')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const body = res.body as ConversationListApiResponse;
      expect(body.conversations.some((c) => c.id === conversationId)).toBe(
        true,
      );
    });

    it("does not include another user's conversations", async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/chat/conversations')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const body = res.body as ConversationListApiResponse;
      expect(
        body.conversations.some((c) => c.id === foreignConversationId),
      ).toBe(false);
    });
  });

  describe('GET /api/v1/chat/conversations/:id', () => {
    it('returns 401 when no Authorization header is provided', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/chat/conversations/${conversationId}`)
        .expect(401);
    });

    it('returns conversation detail with an empty message list initially', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/chat/conversations/${conversationId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const body = res.body as ConversationDetailApiResponse;
      expect(body.id).toBe(conversationId);
      expect(body.messages).toEqual([]);
    });

    it('returns 404 for a conversation owned by another user', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/chat/conversations/${foreignConversationId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });

    it('returns 404 for an unknown conversation id', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/chat/conversations/00000000-0000-7000-8000-000000000000')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });

  describe('POST /api/v1/chat/conversations/:id/messages', () => {
    it('returns 401 when no Authorization header is provided', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/chat/conversations/${conversationId}/messages`)
        .send({ content: 'Hi' })
        .expect(401);
    });

    it('returns 400 for blank content', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/chat/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ content: '   ' })
        .expect(400);
    });

    it('returns 404 for a foreign conversation', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/chat/conversations/${foreignConversationId}/messages`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ content: 'Hi' })
        .expect(404);
    });

    it('persists the user message and returns the stub bot greeting on the first turn', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/chat/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ content: 'Hello there.' })
        .expect(201);

      const body = res.body as PostMessageApiResponse;
      expect(body.userMessage.role).toBe('user');
      expect(body.userMessage.content).toBe('Hello there.');
      expect(body.assistantMessage.role).toBe('assistant');
      expect(body.assistantMessage.content).toBe(
        "Hi! I'm your practice partner. What would you like to talk about today?",
      );
    });

    it('quotes a fragment of the user message on the next turn', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/chat/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          content: 'I went to the store yesterday. I bought some fresh apples.',
        })
        .expect(201);

      const body = res.body as PostMessageApiResponse;
      expect(body.assistantMessage.content).toContain(
        '"I bought some fresh apples."',
      );
    });

    it('reflects both messages in the conversation detail, ordered by createdAt', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/chat/conversations/${conversationId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const body = res.body as ConversationDetailApiResponse;
      expect(body.messages).toHaveLength(4);
      expect(body.messages.map((m) => m.role)).toEqual([
        'user',
        'assistant',
        'user',
        'assistant',
      ]);
    });

    it('bumps the conversation updatedAt and moves it to the top of the list', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/chat/conversations')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const body = res.body as ConversationListApiResponse;
      expect(body.conversations[0]?.id).toBe(conversationId);
      expect(body.conversations[0]?.lastMessagePreview).toEqual(
        expect.any(String),
      );
    });
  });

  describe('GET /api/v1/chat/conversations/:id/suggestions', () => {
    it('returns 401 when no Authorization header is provided', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/chat/conversations/${conversationId}/suggestions`)
        .expect(401);
    });

    it('returns 404 for a foreign conversation', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/chat/conversations/${foreignConversationId}/suggestions`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });

    it('returns analyzedAt null before analysis has run', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/chat/conversations/${conversationId}/suggestions`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const body = res.body as SuggestionsApiResponse;
      expect(body.analyzedAt).toBeNull();
    });

    it('returns suggestions with analyzedAt set after triggering analysis directly', async () => {
      const analysisService = app.get(ChatAnalysisService);
      await analysisService.analyzeConversation(conversationId);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/chat/conversations/${conversationId}/suggestions`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const body = res.body as SuggestionsApiResponse;
      expect(body.analyzedAt).toEqual(expect.any(String));
      expect(Array.isArray(body.suggestions)).toBe(true);
    });
  });
});
