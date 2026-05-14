import {
  BadGatewayException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ProviderUnavailableError } from '../definitions/definitions.errors';
import { LOOKUP_WORD_USE_CASE } from './dictionary.tokens';
import { DefinitionsNotFoundException } from './dictionary.errors';
import { LookupWordDto } from './dto/lookup-word.dto';
import type { LookupWordOutput } from './types/lookup-word.types';
import type { LookupWordUseCase } from './application/lookup-word.use-case';

@Controller('dictionary')
@UseGuards(JwtAuthGuard)
export class DictionaryController {
  constructor(
    @Inject(LOOKUP_WORD_USE_CASE)
    private readonly lookupWordUseCase: LookupWordUseCase,
  ) {}

  @Get('lookup')
  async lookup(@Query() query: LookupWordDto): Promise<LookupWordOutput> {
    const language = query.language ?? 'en';
    try {
      return await this.lookupWordUseCase.execute({
        word: query.word,
        language,
      });
    } catch (e: unknown) {
      if (e instanceof DefinitionsNotFoundException) {
        throw new NotFoundException('DEFINITIONS_NOT_FOUND');
      }
      if (e instanceof ProviderUnavailableError) {
        throw new BadGatewayException('PROVIDER_UNAVAILABLE');
      }
      throw e;
    }
  }
}
