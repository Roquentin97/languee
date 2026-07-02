import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WordsModule } from '../words/words.module';
import { DefinitionsModule } from '../definitions/definitions.module';
import { AuthModule } from '../auth/auth.module';
import { DictionaryApiAdapter } from './adapters/dictionary-api.adapter';
import { FreeDictionaryApiAdapter } from './adapters/free-dictionary-api.adapter';
import { WiktionaryApiAdapter } from './adapters/wiktionary-api.adapter';
import { DictionaryService } from './dictionary.service';
import { DictionaryController } from './dictionary.controller';
import { DICTIONARY_API_ADAPTER } from './dictionary.tokens';
import { IDictionaryApiAdapter } from './interfaces/dictionary-api-adapter.interface';

@Module({
  imports: [WordsModule, DefinitionsModule, AuthModule],
  providers: [
    DictionaryApiAdapter,
    FreeDictionaryApiAdapter,
    WiktionaryApiAdapter,
    {
      provide: DICTIONARY_API_ADAPTER,
      useFactory: (
        config: ConfigService,
        devAdapter: DictionaryApiAdapter,
        freeAdapter: FreeDictionaryApiAdapter,
        wiktionaryAdapter: WiktionaryApiAdapter,
      ): IDictionaryApiAdapter => {
        const provider =
          config.get<string>('dictionary.provider') ?? 'wiktionary';
        if (provider === 'dictionaryapi_dev') return devAdapter;
        if (provider === 'freedictionaryapi') return freeAdapter;
        return wiktionaryAdapter;
      },
      inject: [
        ConfigService,
        DictionaryApiAdapter,
        FreeDictionaryApiAdapter,
        WiktionaryApiAdapter,
      ],
    },
    DictionaryService,
  ],
  controllers: [DictionaryController],
  exports: [DictionaryService],
})
export class DictionaryModule {}
