import {
  BadGatewayException,
  Controller,
  Get,
  NotFoundException,
  Query,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadGatewayResponse,
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import { ProviderUnavailableError } from '../definitions/definitions.errors';
import { DefinitionsNotFoundException } from '../dictionary/dictionary.errors';
import { NlpMultiWordError, NlpUnavailableError } from '../nlp/nlp.errors';
import { LookupVocabularyDto } from './dto/lookup-vocabulary.dto';
import { LookupVocabularyResponseDto } from './dto/lookup-vocabulary-response.dto';
import type { LookupVocabularyOutput } from './types/lookup-vocabulary.types';
import { VocabularyService } from './vocabulary.service';

@ApiTags('vocabulary')
@ApiBearerAuth('access-token')
@Controller('vocabulary')
@UseGuards(JwtAuthGuard)
export class VocabularyController {
  constructor(private readonly vocabularyService: VocabularyService) {}

  @Get('lookup')
  @ApiOperation({ summary: 'Look up a vocabulary entry with deck membership' })
  @ApiQuery({ name: 'word', type: String, required: true, example: 'running' })
  @ApiQuery({
    name: 'language',
    type: String,
    required: false,
    example: 'en',
    description: 'ISO 639-1 language code. Defaults to en.',
  })
  @ApiQuery({
    name: 'context',
    type: String,
    required: false,
    example: 'She runs every morning.',
  })
  @ApiQuery({
    name: 'disablePosFiltering',
    enum: ['true', 'false'],
    required: false,
    example: 'false',
  })
  @ApiOkResponse({ type: LookupVocabularyResponseDto })
  @ApiUnauthorizedResponse({ description: 'Not authenticated' })
  @ApiNotFoundResponse({ description: 'Definitions not found' })
  @ApiUnprocessableEntityResponse({
    description: 'Multi-word input is not supported',
  })
  @ApiBadGatewayResponse({
    description: 'NLP service or dictionary provider unavailable',
  })
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
