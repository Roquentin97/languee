import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DictionaryApiAdapter } from './adapters/dictionary-api.adapter';
import { FreeDictionaryApiAdapter } from './adapters/free-dictionary-api.adapter';
import { DICTIONARY_API_ADAPTER } from './dictionary.tokens';
import { IDictionaryApiAdapter } from './interfaces/dictionary-api-adapter.interface';
import {
  DICTIONARYAPI_DEV_PROVIDER_NAME,
  FREE_DICTIONARY_API_PROVIDER_NAME,
} from './constants';
import { ProviderUnavailableError } from '../definitions/definitions.errors';
import { DictionaryService } from './dictionary.service';
import { WordsService } from '../words/words.service';
import { DefinitionService } from '../definitions/definitions.service';
import { BadGatewayException, NotFoundException } from '@nestjs/common';
import { DictionaryController } from './dictionary.controller';

function buildAdapterFactory() {
  return {
    provide: DICTIONARY_API_ADAPTER,
    useFactory: (
      config: ConfigService,
      devAdapter: DictionaryApiAdapter,
      freeAdapter: FreeDictionaryApiAdapter,
    ): IDictionaryApiAdapter => {
      const configured =
        config.get<string>('dictionary.provider') ?? 'freedictionaryapi';
      return configured === 'dictionaryapi_dev' ? devAdapter : freeAdapter;
    },
    inject: [ConfigService, DictionaryApiAdapter, FreeDictionaryApiAdapter],
  };
}

async function compileWithProvider(
  providerValue: string,
): Promise<TestingModule> {
  const mockConfigService = {
    get: jest.fn().mockImplementation((key: string) => {
      if (key === 'dictionary.provider') return providerValue;
      return undefined;
    }),
  };

  return Test.createTestingModule({
    providers: [
      DictionaryApiAdapter,
      FreeDictionaryApiAdapter,
      { provide: ConfigService, useValue: mockConfigService },
      buildAdapterFactory(),
    ],
  }).compile();
}

describe('DictionaryModule — provider selection via factory', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('DICTIONARY_PROVIDER="freedictionaryapi" → DICTIONARY_API_ADAPTER resolves to FreeDictionaryApiAdapter', async () => {
    const module = await compileWithProvider('freedictionaryapi');
    const adapter = module.get<IDictionaryApiAdapter>(DICTIONARY_API_ADAPTER);
    expect(adapter).toBeInstanceOf(FreeDictionaryApiAdapter);
    expect(adapter.providerName).toBe(FREE_DICTIONARY_API_PROVIDER_NAME);
    await module.close();
  });

  it('DICTIONARY_PROVIDER="dictionaryapi_dev" → DICTIONARY_API_ADAPTER resolves to DictionaryApiAdapter', async () => {
    const module = await compileWithProvider('dictionaryapi_dev');
    const adapter = module.get<IDictionaryApiAdapter>(DICTIONARY_API_ADAPTER);
    expect(adapter).toBeInstanceOf(DictionaryApiAdapter);
    expect(adapter.providerName).toBe(DICTIONARYAPI_DEV_PROVIDER_NAME);
    await module.close();
  });

  it('absent/unrecognised provider value defaults to FreeDictionaryApiAdapter', async () => {
    // When get() returns undefined, the factory falls back to 'freedictionaryapi'
    const mockConfigService = {
      get: jest.fn().mockReturnValue(undefined),
    };
    const module = await Test.createTestingModule({
      providers: [
        DictionaryApiAdapter,
        FreeDictionaryApiAdapter,
        { provide: ConfigService, useValue: mockConfigService },
        buildAdapterFactory(),
      ],
    }).compile();

    const adapter = module.get<IDictionaryApiAdapter>(DICTIONARY_API_ADAPTER);
    expect(adapter).toBeInstanceOf(FreeDictionaryApiAdapter);
    await module.close();
  });

  it('both adapters are independently instantiable as module providers', async () => {
    const mockConfigService = {
      get: jest.fn().mockReturnValue('freedictionaryapi'),
    };
    const module = await Test.createTestingModule({
      providers: [
        DictionaryApiAdapter,
        FreeDictionaryApiAdapter,
        { provide: ConfigService, useValue: mockConfigService },
        buildAdapterFactory(),
      ],
    }).compile();

    const devAdapter = module.get<DictionaryApiAdapter>(DictionaryApiAdapter);
    const freeAdapter = module.get<FreeDictionaryApiAdapter>(
      FreeDictionaryApiAdapter,
    );
    expect(devAdapter).toBeInstanceOf(DictionaryApiAdapter);
    expect(freeAdapter).toBeInstanceOf(FreeDictionaryApiAdapter);
    expect(devAdapter).not.toBe(freeAdapter);
    await module.close();
  });
});

describe('DictionaryController — provider failure maps to DICTIONARY_PROVIDER_UNAVAILABLE', () => {
  let controller: DictionaryController;
  let testModule: TestingModule;

  const wordsServiceMock = {
    canonicalise: jest.fn().mockImplementation((w: string) => w.toLowerCase()),
    findByLemma: jest.fn(),
    ensureExistsAndReturn: jest.fn(),
  };
  const definitionServiceMock = {
    findByWordId: jest.fn(),
    createMany: jest.fn(),
  };
  const adapterMock: jest.Mocked<IDictionaryApiAdapter> = {
    providerName: 'freedictionaryapi',
    fetch: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    wordsServiceMock.canonicalise.mockImplementation((w: string) =>
      w.toLowerCase(),
    );

    testModule = await Test.createTestingModule({
      providers: [
        DictionaryService,
        { provide: WordsService, useValue: wordsServiceMock },
        { provide: DefinitionService, useValue: definitionServiceMock },
        { provide: DICTIONARY_API_ADAPTER, useValue: adapterMock },
      ],
      controllers: [DictionaryController],
    }).compile();

    controller = testModule.get<DictionaryController>(DictionaryController);
  });

  afterEach(async () => {
    await testModule.close();
  });

  it('ProviderUnavailableError from configured provider maps to BadGatewayException with DICTIONARY_PROVIDER_UNAVAILABLE error code', async () => {
    wordsServiceMock.findByLemma.mockResolvedValue(null);
    wordsServiceMock.ensureExistsAndReturn.mockResolvedValue({
      id: 'word-id',
      lemma: 'run',
      language: 'en',
      ipa: null,
      createdAt: new Date(),
    });
    adapterMock.fetch.mockRejectedValue(
      new ProviderUnavailableError('freedictionaryapi'),
    );

    await expect(
      controller.lookup({ word: 'run', language: 'en' }),
    ).rejects.toBeInstanceOf(BadGatewayException);

    try {
      await controller.lookup({ word: 'run', language: 'en' });
    } catch (e: unknown) {
      expect(e).toBeInstanceOf(BadGatewayException);
      const ex = e as BadGatewayException;
      const body = ex.getResponse() as { message: string; error: string };
      expect(body.error).toBe('DICTIONARY_PROVIDER_UNAVAILABLE');
      expect(body.message).toBe(
        'Dictionary lookup is temporarily unavailable. Please try again later.',
      );
    }
  });

  it('DefinitionsNotFoundException maps to NotFoundException (not BadGatewayException)', async () => {
    wordsServiceMock.findByLemma.mockResolvedValue(null);
    wordsServiceMock.ensureExistsAndReturn.mockResolvedValue({
      id: 'word-id',
      lemma: 'unknownword',
      language: 'en',
      ipa: null,
      createdAt: new Date(),
    });
    adapterMock.fetch.mockResolvedValue([]);

    await expect(
      controller.lookup({ word: 'unknownword', language: 'en' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lookup only calls the single configured adapter — not both', async () => {
    wordsServiceMock.findByLemma.mockResolvedValue(null);
    wordsServiceMock.ensureExistsAndReturn.mockResolvedValue({
      id: 'word-id',
      lemma: 'run',
      language: 'en',
      ipa: null,
      createdAt: new Date(),
    });
    adapterMock.fetch.mockResolvedValue([]);

    try {
      await controller.lookup({ word: 'run', language: 'en' });
    } catch {
      // expected NotFoundException
    }

    // The injected adapter was called exactly once
    expect(adapterMock.fetch.mock.calls).toHaveLength(1);
  });
});
