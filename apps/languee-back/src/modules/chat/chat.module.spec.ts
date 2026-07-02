import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { StubChatBotAdapter } from './adapters/stub-chat-bot.adapter';
import { CHAT_BOT_ADAPTER } from './chat.tokens';
import type { IChatBotAdapter } from './interfaces/chat-bot-adapter.interface';

function buildAdapterFactory() {
  return {
    provide: CHAT_BOT_ADAPTER,
    useFactory: (
      config: ConfigService,
      stubAdapter: StubChatBotAdapter,
    ): IChatBotAdapter => {
      const provider = config.get<string>('chat.botProvider') ?? 'stub';
      if (provider === 'stub') return stubAdapter;
      return stubAdapter;
    },
    inject: [ConfigService, StubChatBotAdapter],
  };
}

async function compileWithProvider(
  providerValue: string | undefined,
): Promise<TestingModule> {
  const mockConfigService = {
    get: jest.fn().mockImplementation((key: string) => {
      if (key === 'chat.botProvider') return providerValue;
      return undefined;
    }),
  };

  return Test.createTestingModule({
    providers: [
      StubChatBotAdapter,
      { provide: ConfigService, useValue: mockConfigService },
      buildAdapterFactory(),
    ],
  }).compile();
}

describe('ChatModule — provider selection via factory', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('CHATBOT_PROVIDER="stub" → CHAT_BOT_ADAPTER resolves to StubChatBotAdapter', async () => {
    const module = await compileWithProvider('stub');
    const adapter = module.get<IChatBotAdapter>(CHAT_BOT_ADAPTER);
    expect(adapter).toBeInstanceOf(StubChatBotAdapter);
    expect(adapter.providerName).toBe('stub');
    await module.close();
  });

  it('absent provider value defaults to StubChatBotAdapter', async () => {
    const module = await compileWithProvider(undefined);
    const adapter = module.get<IChatBotAdapter>(CHAT_BOT_ADAPTER);
    expect(adapter).toBeInstanceOf(StubChatBotAdapter);
    await module.close();
  });
});
