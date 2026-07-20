import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadGatewayResponse,
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { API_V1_PREFIX } from '../core/api-prefix';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import {
  DefinitionAlreadyExistsError,
  ProviderUnavailableError,
} from '../definitions/definitions.errors';
import { DefinitionsNotFoundException } from '../dictionary/dictionary.errors';
import { NlpInputInvalidError, NlpUnavailableError } from '../nlp/nlp.errors';
import {
  PartOfSpeechRequiredError,
  TextMustBeExpressionError,
  TextMustBeSingleWordError,
} from './vocabulary.errors';
import { LookupVocabularyDto } from './dto/lookup-vocabulary.dto';
import { LookupVocabularyResponseDto } from './dto/lookup-vocabulary-response.dto';
import { CreateUserDefinitionDto } from './dto/create-user-definition.dto';
import { CreateUserDefinitionResponseDto } from './dto/create-user-definition-response.dto';
import type { LookupVocabularyOutput } from './types/lookup-vocabulary.types';
import type { CreateUserDefinitionOutput } from './types/create-user-definition.types';
import { VocabularyService } from './vocabulary.service';

@ApiTags('vocabulary')
@ApiBearerAuth('access-token')
@Controller(`${API_V1_PREFIX}/vocabulary`)
@UseGuards(JwtAuthGuard)
export class VocabularyController {
  constructor(private readonly vocabularyService: VocabularyService) {}

  @Get('lookup')
  @ApiOperation({ summary: 'Look up a vocabulary entry with deck membership' })
  @ApiQuery({
    name: 'word',
    type: String,
    required: true,
    example: 'running',
  })
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
  @ApiBadRequestResponse({
    description: 'NLP rejected the input (token count, unsupported language)',
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
      if (err instanceof NlpInputInvalidError) {
        throw new BadRequestException('INPUT_INVALID');
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

  @Post('definitions')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Create a user-provided definition for a word or expression the dictionary provider does not know',
  })
  @ApiCreatedResponse({ type: CreateUserDefinitionResponseDto })
  @ApiUnauthorizedResponse({ description: 'Not authenticated' })
  @ApiBadRequestResponse({
    description:
      'Validation failure, declared kind not matching the text, missing partOfSpeech, or input rejected by NLP',
  })
  @ApiConflictResponse({ description: 'Definition already exists' })
  @ApiBadGatewayResponse({
    description: 'NLP service unavailable',
  })
  async createUserDefinition(
    @Body() body: CreateUserDefinitionDto,
  ): Promise<CreateUserDefinitionOutput> {
    try {
      return await this.vocabularyService.createUserDefinition({
        text: body.text,
        language: body.language ?? 'en',
        kind: body.kind,
        definition: body.definition,
        example: body.example,
        partOfSpeech: body.partOfSpeech,
      });
    } catch (err: unknown) {
      if (err instanceof TextMustBeSingleWordError) {
        throw new BadRequestException('TEXT_MUST_BE_SINGLE_WORD');
      }
      if (err instanceof TextMustBeExpressionError) {
        throw new BadRequestException('TEXT_MUST_BE_EXPRESSION');
      }
      if (err instanceof PartOfSpeechRequiredError) {
        throw new BadRequestException('PART_OF_SPEECH_REQUIRED');
      }
      if (err instanceof NlpInputInvalidError) {
        throw new BadRequestException('INPUT_INVALID');
      }
      if (err instanceof DefinitionAlreadyExistsError) {
        throw new ConflictException('DEFINITION_ALREADY_EXISTS');
      }
      if (err instanceof NlpUnavailableError) {
        throw new BadGatewayException('NLP_UNAVAILABLE');
      }
      if (err instanceof ProviderUnavailableError) {
        throw new BadGatewayException('PROVIDER_UNAVAILABLE');
      }
      throw err;
    }
  }
}
