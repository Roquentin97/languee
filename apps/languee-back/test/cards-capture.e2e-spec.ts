import {
  ExecutionContext,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { CurrentUserPayload } from '../src/modules/identity/auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../src/modules/identity/auth/guards/jwt-auth.guard';
import { CardsController } from '../src/modules/learning/cards/cards.controller';
import { CardsService } from '../src/modules/learning/cards/cards.service';

const USER: CurrentUserPayload = {
  userId: 'capture-user',
  sessionId: 'capture-session',
};
const DECK_ID = '1db3f769-e154-44c6-9b98-87de1037a395';
const DEFINITION_ID = 'a2e4529c-cfb7-4f4f-bdb2-0c15e590bf55';
const LOOKUP_ID = 'f26c3fb1-1085-4fb2-958d-27312d836ab2';
const CONTEXT = '🧠 gave the book up.';
const COMPONENT_RANGES = [
  { start: 2, end: 6 },
  { start: 16, end: 18 },
];

const createCard = jest
  .fn<ReturnType<CardsService['create']>, Parameters<CardsService['create']>>()
  .mockResolvedValue([]);

describe('CardsController capture ranges (HTTP)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [CardsController],
      providers: [
        { provide: CardsService, useValue: { create: createCard } },
        JwtAuthGuard,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext): boolean => {
          context
            .switchToHttp()
            .getRequest<{ user?: CurrentUserPayload }>().user = USER;
          return true;
        },
      })
      .compile();

    app = moduleFixture.createNestApplication<INestApplication<App>>();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    createCard.mockReset().mockResolvedValue([]);
  });

  it('forwards valid discontinuous code-point ranges and the selected lookup ID', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/cards')
      .send({
        lookupId: LOOKUP_ID,
        deckId: DECK_ID,
        definitionId: DEFINITION_ID,
        context: CONTEXT,
        targetRanges: COMPONENT_RANGES,
      })
      .expect(201, { cards: [] });

    expect(createCard).toHaveBeenCalledWith(
      USER.userId,
      DECK_ID,
      DEFINITION_ID,
      CONTEXT,
      undefined,
      LOOKUP_ID,
      COMPONENT_RANGES,
    );
  });

  it.each<[string, unknown]>([
    ['partial word', [{ start: 2, end: 5 }]],
    [
      'overlapping components',
      [
        { start: 2, end: 6 },
        { start: 2, end: 6 },
      ],
    ],
    ['out-of-bounds range', [{ start: 2, end: 30 }]],
    ['boolean offset', [{ start: true, end: 6 }]],
    ['string offset', [{ start: '2', end: 6 }]],
  ])(
    'rejects %s ranges before calling the card service',
    async (_case, ranges) => {
      await request(app.getHttpServer())
        .post('/api/v1/cards')
        .send({
          deckId: DECK_ID,
          definitionId: DEFINITION_ID,
          context: CONTEXT,
          targetRanges: ranges,
        })
        .expect(400);

      expect(createCard).not.toHaveBeenCalled();
    },
  );

  it('keeps manual saves valid when target ranges are omitted', async () => {
    const context = 'She gave up.';
    await request(app.getHttpServer())
      .post('/api/v1/cards')
      .send({
        deckId: DECK_ID,
        definitionId: DEFINITION_ID,
        context,
      })
      .expect(201, { cards: [] });

    expect(createCard).toHaveBeenCalledWith(
      USER.userId,
      DECK_ID,
      DEFINITION_ID,
      context,
      undefined,
      undefined,
      undefined,
    );
  });
});
