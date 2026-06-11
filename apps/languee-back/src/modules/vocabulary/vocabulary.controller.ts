import {
  BadGatewayException,
  Controller,
  Get,
  NotFoundException,
  Query,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import { ProviderUnavailableError } from '../definitions/definitions.errors';
import { DefinitionsNotFoundException } from '../dictionary/dictionary.errors';
import { NlpMultiWordError, NlpUnavailableError } from '../nlp/nlp.errors';
import { LookupVocabularyDto } from './dto/lookup-vocabulary.dto';
import type { LookupVocabularyOutput } from './types/lookup-vocabulary.types';
import { VocabularyService } from './vocabulary.service';

@Controller('vocabulary')
@UseGuards(JwtAuthGuard)
export class VocabularyController {
  constructor(private readonly vocabularyService: VocabularyService) {}

  @Get('lookup')
  async lookup(
    @Query() query: LookupVocabularyDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<LookupVocabularyOutput> {
    try {
      return await this.vocabularyService.lookup({
        word: query.word,
        language: query.language ?? 'en',
        userId: user.userId,
        context: query.context,
        disablePosFiltering: query.disablePosFiltering === 'true',
      });
    } catch (err: unknown) {
      if (err instanceof NlpUnavailableError) {
        throw new BadGatewayException('NLP_UNAVAILABLE');
      }
      if (err instanceof NlpMultiWordError) {
        throw new UnprocessableEntityException(
          'MULTI_WORD_INPUT_NOT_SUPPORTED',
        );
      }
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
