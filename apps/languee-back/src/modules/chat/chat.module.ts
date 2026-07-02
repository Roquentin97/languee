import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaModule } from '../core/prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { WordsModule } from '../words/words.module';
import { DefinitionsModule } from '../definitions/definitions.module';
import { SynonymsModule } from '../synonyms/synonyms.module';
import { StubChatBotAdapter } from './adapters/stub-chat-bot.adapter';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { ChatAnalysisService } from './chat-analysis.service';
import { ChatAnalysisWorker } from './chat-analysis.worker';
import { CHAT_BOT_ADAPTER } from './chat.tokens';
import type { IChatBotAdapter } from './interfaces/chat-bot-adapter.interface';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    WordsModule,
    DefinitionsModule,
    SynonymsModule,
  ],
  providers: [
    StubChatBotAdapter,
    {
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
    },
    ChatService,
    ChatAnalysisService,
    ChatAnalysisWorker,
  ],
  controllers: [ChatController],
  exports: [ChatService, ChatAnalysisService],
})
export class ChatModule {}
