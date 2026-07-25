import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import {
  DocumentBuilder,
  SwaggerModule,
  type OpenAPIObject,
} from '@nestjs/swagger';

jest.mock('../../health/health.service', () => ({
  HealthService: class HealthService {},
}));
jest.mock('../../auth/auth.service', () => ({
  AuthService: class AuthService {},
}));
jest.mock('../../ankidroid-exports/ankidroid-exports.service', () => ({
  AnkiDroidExportsService: class AnkiDroidExportsService {},
}));
jest.mock('../../cards/cards.service', () => ({
  CardsService: class CardsService {},
}));
jest.mock('../../decks/decks.service', () => ({
  DecksService: class DecksService {},
}));
jest.mock('../../dictionary/dictionary.service', () => ({
  DictionaryService: class DictionaryService {},
}));
jest.mock('../../system/system.service', () => ({
  SystemService: class SystemService {},
}));
jest.mock('../../vocabulary/vocabulary.service', () => ({
  VocabularyService: class VocabularyService {},
}));

import { HealthController } from '../../health/health.controller';
import { HealthService } from '../../health/health.service';
import { AuthController } from '../../auth/auth.controller';
import { AuthService } from '../../auth/auth.service';
import { MobileAuthController } from '../../auth/mobile-auth.controller';
import { AnkiDroidExportsController } from '../../ankidroid-exports/ankidroid-exports.controller';
import { AnkiDroidExportsService } from '../../ankidroid-exports/ankidroid-exports.service';
import { CardsController } from '../../cards/cards.controller';
import { CardsService } from '../../cards/cards.service';
import { DecksController } from '../../decks/decks.controller';
import { DecksService } from '../../decks/decks.service';
import { DictionaryController } from '../../dictionary/dictionary.controller';
import { DictionaryService } from '../../dictionary/dictionary.service';
import { SystemController } from '../../system/system.controller';
import { SystemService } from '../../system/system.service';
import { VocabularyController } from '../../vocabulary/vocabulary.controller';
import { VocabularyService } from '../../vocabulary/vocabulary.service';

type HttpMethod = 'get' | 'post';

type DocumentParameter = {
  name?: string;
  in?: string;
};

type DocumentOperation = {
  parameters?: DocumentParameter[];
  requestBody?: unknown;
  responses?: Record<string, unknown>;
};

type DocumentPath = Partial<Record<HttpMethod, DocumentOperation>>;

type OperationExpectation = {
  path: string;
  method: HttpMethod;
  parameters?: string[];
  requestBodySchema?: string;
  responses: string[];
  responseSchema?: string;
};

const expectations: OperationExpectation[] = [
  { path: '/', method: 'get', responses: ['200'] },
  { path: '/version', method: 'get', responses: ['200'] },
  { path: '/system/env', method: 'get', responses: ['200'] },
  {
    path: '/auth/register',
    method: 'post',
    requestBodySchema: 'RegisterDto',
    responses: ['201'],
    responseSchema: 'AuthUserResponseDto',
  },
  {
    path: '/auth/login',
    method: 'post',
    requestBodySchema: 'LoginDto',
    responses: ['200', '401'],
    responseSchema: 'AccessTokenResponseDto',
  },
  {
    path: '/auth/refresh',
    method: 'post',
    responses: ['200', '401'],
    responseSchema: 'AccessTokenResponseDto',
  },
  {
    path: '/auth/logout',
    method: 'post',
    responses: ['200', '401'],
    responseSchema: 'MessageResponseDto',
  },
  {
    path: '/auth/logout-all',
    method: 'post',
    responses: ['200', '401'],
    responseSchema: 'MessageResponseDto',
  },
  {
    path: '/auth/sessions',
    method: 'get',
    responses: ['200', '401'],
    responseSchema: 'AuthSessionResponseDto',
  },
  {
    path: '/auth/mobile/register',
    method: 'post',
    requestBodySchema: 'RegisterDto',
    responses: ['201'],
    responseSchema: 'MobileRegisterResponseDto',
  },
  {
    path: '/auth/mobile/login',
    method: 'post',
    requestBodySchema: 'LoginDto',
    responses: ['200', '401'],
    responseSchema: 'MobileLoginResponseDto',
  },
  {
    path: '/auth/mobile/refresh',
    method: 'post',
    requestBodySchema: 'MobileRefreshRequestDto',
    responses: ['200', '401'],
    responseSchema: 'MobileRefreshResponseDto',
  },
  {
    path: '/auth/mobile/logout',
    method: 'post',
    responses: ['200', '401'],
    responseSchema: 'MessageResponseDto',
  },
  {
    path: '/auth/mobile/logout-all',
    method: 'post',
    responses: ['200', '401'],
    responseSchema: 'MessageResponseDto',
  },
  {
    path: '/auth/mobile/sessions',
    method: 'get',
    responses: ['200', '401'],
    responseSchema: 'AuthSessionResponseDto',
  },
  {
    path: '/api/v1/dictionary/lookup',
    method: 'get',
    parameters: ['word', 'language'],
    responses: ['200', '401', '404', '502'],
    responseSchema: 'LookupWordResponseDto',
  },
  {
    path: '/api/v1/vocabulary/lookup',
    method: 'get',
    parameters: ['word', 'language', 'context', 'disablePosFiltering'],
    responses: ['200', '400', '401', '404', '502'],
    responseSchema: 'LookupVocabularyResponseDto',
  },
  {
    path: '/api/v1/decks',
    method: 'post',
    requestBodySchema: 'CreateDeckDto',
    responses: ['201', '401', '409'],
    responseSchema: 'DeckResponseDto',
  },
  {
    path: '/api/v1/decks',
    method: 'get',
    responses: ['200', '401'],
    responseSchema: 'DeckResponseDto',
  },
  {
    path: '/api/v1/decks/{id}',
    method: 'get',
    parameters: ['id'],
    responses: ['200', '401', '404'],
    responseSchema: 'DeckResponseDto',
  },
  {
    path: '/api/v1/cards',
    method: 'post',
    requestBodySchema: 'CreateCardDto',
    responses: ['201', '401', '404', '409'],
    responseSchema: 'CardResponseDto',
  },
  {
    path: '/api/v1/cards',
    method: 'get',
    responses: ['200', '401'],
    responseSchema: 'CardListItemResponseDto',
  },
  {
    path: '/api/v1/cards/{id}',
    method: 'get',
    parameters: ['id'],
    responses: ['200', '401', '404'],
    responseSchema: 'CardDetailResponseDto',
  },
  {
    path: '/api/v1/cards/{cardId}/ankidroid-exports',
    method: 'post',
    responses: ['200', '201', '401', '404'],
    responseSchema: 'AnkiDroidExportResponseDto',
  },
  {
    path: '/api/v1/ankidroid-exports/{id}',
    method: 'get',
    parameters: ['id'],
    responses: ['200', '401', '404'],
    responseSchema: 'AnkiDroidExportDetailResponseDto',
  },
  {
    path: '/api/v1/ankidroid-exports/{id}/attempts',
    method: 'post',
    requestBodySchema: 'RecordAttemptDto',
    responses: ['201', '401', '404'],
    responseSchema: 'AnkiDroidExportDetailResponseDto',
  },
];

function getOperation(
  document: OpenAPIObject,
  path: string,
  method: HttpMethod,
): DocumentOperation {
  const paths = document.paths as Record<string, DocumentPath | undefined>;
  const pathItem = paths[path];
  expect(pathItem).toBeDefined();

  const operation = pathItem?.[method];
  expect(operation).toBeDefined();

  return operation as DocumentOperation;
}

function expectSerializedValueToContain(
  value: unknown,
  expected: string,
): void {
  expect(JSON.stringify(value)).toContain(expected);
}

describe('generated Swagger schema', () => {
  let app: INestApplication;
  let document: OpenAPIObject;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [
        HealthController,
        AnkiDroidExportsController,
        AuthController,
        MobileAuthController,
        CardsController,
        DecksController,
        DictionaryController,
        SystemController,
        VocabularyController,
      ],
      providers: [
        {
          provide: HealthService,
          useValue: { getHello: jest.fn(), getVersion: jest.fn() },
        },
        {
          provide: AnkiDroidExportsService,
          useValue: {
            getOrCreateExportForCard: jest.fn(),
            findOneById: jest.fn(),
            recordAttempt: jest.fn(),
          },
        },
        {
          provide: AuthService,
          useValue: {
            getSessions: jest.fn(),
            login: jest.fn(),
            loginMobile: jest.fn(),
            logout: jest.fn(),
            logoutAll: jest.fn(),
            refresh: jest.fn(),
            register: jest.fn(),
          },
        },
        {
          provide: CardsService,
          useValue: {
            create: jest.fn(),
            findManyByUserId: jest.fn(),
            findOneByIdAndUserId: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('test') },
        },
        {
          provide: DecksService,
          useValue: {
            create: jest.fn(),
            findAll: jest.fn(),
            findOneOrThrow: jest.fn(),
          },
        },
        { provide: DictionaryService, useValue: { lookup: jest.fn() } },
        { provide: SystemService, useValue: { getEnv: jest.fn() } },
        { provide: VocabularyService, useValue: { lookup: jest.fn() } },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    const config = new DocumentBuilder()
      .setTitle('Languee API')
      .setVersion('1.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        'access-token',
      )
      .build();

    document = SwaggerModule.createDocument(app, config);
  });

  afterAll(async () => {
    await app.close();
  });

  it.each(expectations)(
    '$method $path documents expected parameters, body, and responses',
    (expected) => {
      const operation = getOperation(document, expected.path, expected.method);
      const parameterNames =
        operation.parameters?.map((parameter) => parameter.name) ?? [];

      expect(parameterNames).toEqual(
        expect.arrayContaining(expected.parameters ?? []),
      );

      if (expected.requestBodySchema) {
        expect(operation.requestBody).toBeDefined();
        expectSerializedValueToContain(
          operation.requestBody,
          expected.requestBodySchema,
        );
      } else {
        expect(operation.requestBody).toBeUndefined();
      }

      expect(Object.keys(operation.responses ?? {})).toEqual(
        expect.arrayContaining(expected.responses),
      );

      if (expected.responseSchema) {
        expectSerializedValueToContain(
          operation.responses?.[expected.responses[0]],
          expected.responseSchema,
        );
      }
    },
  );
});
