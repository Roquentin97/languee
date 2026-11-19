import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { CardsService } from '../cards/cards.service';
import { JwtAuthGuard } from '../../identity/auth/guards/jwt-auth.guard';
import { JwtStrategy } from '../../identity/auth/strategies/jwt.strategy';
import { NlpService } from '../../lexicon/enrichment/nlp/nlp.service';
import { DictionaryService } from '../../lexicon/enrichment/dictionary/dictionary.service';
import { DefinitionService } from '../../lexicon/entries/definitions/definitions.service';
import { LexicalEntriesService } from '../../lexicon/entries/lexical-entries/lexical-entries.service';
import { RequestContextMiddleware } from '../../system/core/context/request-context.middleware';
import { RedisService } from '../../system/core/redis/redis.service';
import { RequestService } from '../../system/core/http/request.service';
import { VocabularyController } from './vocabulary.controller';
import { VocabularyService } from './vocabulary.service';
import request from 'supertest';

const TEST_JWT_SECRET = 'local-only-jwt-secret-for-integration-test';
const TEST_BASIC_LOGIN = 'local-observability-test';
const TEST_BASIC_PASSWORD = 'local-test-password';
const TEST_USER_ID = 'local-observability-test-user';
const TEST_SESSION_ID = 'local-observability-test-session';
const TEST_REQUEST_ID = 'local-unsupported-language';
const LIVE_NLP_TEST_URL = process.env['LANGUEE_NLP_LOCAL_TEST_URL'];

interface ReceivedNlpRequest {
  method: string | undefined;
  url: string | undefined;
  authorization: string | undefined;
  requestId: string | string[] | undefined;
  body: unknown;
}

describe('authenticated vocabulary lookup to NLP over HTTP', () => {
  let app: INestApplication;
  let server: Server | undefined;
  let baseUrl: string;
  let accessToken: string;
  let receivedNlpRequest: ReceivedNlpRequest | undefined;

  beforeAll(async () => {
    if (LIVE_NLP_TEST_URL !== undefined) {
      const liveUrl = new URL(LIVE_NLP_TEST_URL);
      if (!['127.0.0.1', 'localhost', '[::1]'].includes(liveUrl.hostname)) {
        throw new Error('The live NLP integration URL must use loopback');
      }
      baseUrl = LIVE_NLP_TEST_URL;
    } else {
      server = createServer((incoming, outgoing) => {
        const chunks: Buffer[] = [];
        incoming.on('data', (chunk: Buffer | string) =>
          chunks.push(Buffer.from(chunk)),
        );
        incoming.on('end', () => {
          receivedNlpRequest = {
            method: incoming.method,
            url: incoming.url,
            authorization: incoming.headers.authorization,
            requestId: incoming.headers['x-request-id'],
            body: JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown,
          };
          outgoing.writeHead(400, { 'content-type': 'application/json' });
          outgoing.end(JSON.stringify({ detail: 'LANGUAGE_NOT_SUPPORTED' }));
        });
      });

      await new Promise<void>((resolve, reject) => {
        server?.once('error', reject);
        server?.listen(0, '127.0.0.1', resolve);
      });
      const address = server.address();
      if (address === null || typeof address === 'string') {
        throw new Error('Expected the local NLP test server to use a TCP port');
      }
      baseUrl = `http://127.0.0.1:${address.port}`;
    }

    const testSession = JSON.stringify({
      sessionId: TEST_SESSION_ID,
      userId: TEST_USER_ID,
      hashedRefreshToken: 'unused-test-hash',
      userAgent: 'local integration test',
      ip: '127.0.0.1',
      createdAt: new Date(0).toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      revoked: false,
    });
    const configValues: Record<string, string> = {
      'auth.jwtSecret': TEST_JWT_SECRET,
      'nlp.baseUrl': baseUrl,
      'nlp.basicAuthLogin': TEST_BASIC_LOGIN,
      'nlp.basicAuthPassword': TEST_BASIC_PASSWORD,
    };
    const configService = {
      getOrThrow: (key: string) => {
        const value = configValues[key];
        if (value === undefined)
          throw new Error(`Unexpected config key: ${key}`);
        return value;
      },
    };
    const redisService = {
      get: async (key: string) =>
        key === `session:${TEST_SESSION_ID}` ? testSession : null,
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({ secret: TEST_JWT_SECRET }),
      ],
      controllers: [VocabularyController],
      providers: [
        { provide: ConfigService, useValue: configService },
        { provide: RedisService, useValue: redisService },
        RequestService,
        NlpService,
        JwtAuthGuard,
        JwtStrategy,
        { provide: DictionaryService, useValue: {} },
        { provide: CardsService, useValue: {} },
        { provide: LexicalEntriesService, useValue: {} },
        { provide: DefinitionService, useValue: {} },
        {
          provide: VocabularyService,
          useFactory: (
            dictionary: DictionaryService,
            cards: CardsService,
            nlp: NlpService,
            words: LexicalEntriesService,
            definitions: DefinitionService,
          ) =>
            new VocabularyService(dictionary, cards, nlp, words, definitions),
          inject: [
            DictionaryService,
            CardsService,
            NlpService,
            LexicalEntriesService,
            DefinitionService,
          ],
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    const contextMiddleware = new RequestContextMiddleware();
    app.use(contextMiddleware.use.bind(contextMiddleware));
    await app.init();
    accessToken = moduleFixture
      .get<JwtService>(JwtService)
      .sign({ sub: TEST_USER_ID, session_id: TEST_SESSION_ID });
  });

  afterAll(async () => {
    await app?.close();
    if (server?.listening) {
      await new Promise<void>((resolve, reject) => {
        server?.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });

  it('authenticates locally and maps the NLP validation response to INPUT_INVALID', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/vocabulary/lookup')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('X-Request-ID', TEST_REQUEST_ID)
      .send({ text: 'running', language: 'xx' })
      .expect(400);

    expect(response.body.message).toBe('INPUT_INVALID');
    expect(response.headers['x-request-id']).toBe(TEST_REQUEST_ID);

    if (LIVE_NLP_TEST_URL === undefined) {
      expect(receivedNlpRequest).toEqual({
        method: 'POST',
        url: '/analyze',
        authorization: `Basic ${Buffer.from(`${TEST_BASIC_LOGIN}:${TEST_BASIC_PASSWORD}`).toString('base64')}`,
        requestId: TEST_REQUEST_ID,
        body: { text: 'running', language: 'xx' },
      });
    }
  });
});
