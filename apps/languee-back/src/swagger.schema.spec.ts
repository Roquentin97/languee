import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import {
  DocumentBuilder,
  SwaggerModule,
  type OpenAPIObject,
} from '@nestjs/swagger';

jest.mock('./app.service', () => ({ AppService: class AppService {} }));
jest.mock('./modules/auth/auth.service', () => ({
  AuthService: class AuthService {},
}));
jest.mock('./modules/cards/cards.service', () => ({
  CardsService: class CardsService {},
}));
jest.mock('./modules/decks/decks.service', () => ({
  DecksService: class DecksService {},
}));
jest.mock('./modules/dictionary/dictionary.service', () => ({
  DictionaryService: class DictionaryService {},
}));
jest.mock('./modules/system/system.service', () => ({
  SystemService: class SystemService {},
}));
jest.mock('./modules/vocabulary/vocabulary.service', () => ({
  VocabularyService: class VocabularyService {},
}));

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthController } from './modules/auth/auth.controller';
import { AuthService } from './modules/auth/auth.service';
import { MobileAuthController } from './modules/auth/mobile-auth.controller';
import { CardsController } from './modules/cards/cards.controller';
import { CardsService } from './modules/cards/cards.service';
import { DecksController } from './modules/decks/decks.controller';
import { DecksService } from './modules/decks/decks.service';
import { DictionaryController } from './modules/dictionary/dictionary.controller';
import { DictionaryService } from './modules/dictionary/dictionary.service';
import { SystemController } from './modules/system/system.controller';
import { SystemService } from './modules/system/system.service';
import { VocabularyController } from './modules/vocabulary/vocabulary.controller';
import { VocabularyService } from './modules/vocabulary/vocabulary.service';

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
  { path: '/api/v1', method: 'get', responses: ['200'] },
  { path: '/api/v1/system/env', method: 'get', responses: ['200'] },
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
    responses: ['200', '401', '404', '422', '502'],
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
        AppController,
        AuthController,
        MobileAuthController,
        CardsController,
        DecksController,
        DictionaryController,
        SystemController,
        VocabularyController,
      ],
      providers: [
        { provide: AppService, useValue: { getHello: jest.fn() } },
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
        { provide: CardsService, useValue: { create: jest.fn() } },
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
