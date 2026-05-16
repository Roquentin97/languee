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
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import { ProviderUnavailableError } from '../definitions/definitions.errors';
import { DefinitionsNotFoundException } from '../dictionary/dictionary.errors';
import { LOOKUP_VOCABULARY_USE_CASE } from './vocabulary.tokens';
import { LookupVocabularyDto } from './dto/lookup-vocabulary.dto';
import type { LookupVocabularyOutput } from './types/lookup-vocabulary.types';
import type { LookupVocabularyUseCase } from './application/lookup-vocabulary.use-case';

@Controller('vocabulary')
@UseGuards(JwtAuthGuard)
export class VocabularyController {
  constructor(
    @Inject(LOOKUP_VOCABULARY_USE_CASE)
    private readonly lookupVocabularyUseCase: LookupVocabularyUseCase,
  ) {}

  @Get('lookup')
  async lookup(
    @Query() query: LookupVocabularyDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<LookupVocabularyOutput> {
    try {
      return await this.lookupVocabularyUseCase.execute({
        word: query.word,
        language: query.language ?? 'en',
        userId: user.userId,
      });
    } catch (err: unknown) {
      if (err instanceof DefinitionsNotFoundException) {
        throw new NotFoundException('DEFINITIONS_NOT_FOUND');
      }
      if (err instanceof ProviderUnavailableError) {
        throw new BadGatewayException('PROVIDER_UNAVAILABLE');
      }
      throw err;
    }
  }
}
