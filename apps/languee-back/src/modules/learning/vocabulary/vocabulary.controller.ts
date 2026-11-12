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
import { API_V1_PREFIX } from '../../system/core/api-prefix';
import { JwtAuthGuard } from '../../identity/auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../identity/auth/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../../identity/auth/decorators/current-user.decorator';
import {
  DefinitionAlreadyExistsError,
  ProviderUnavailableError,
} from '../../lexicon/entries/definitions/definitions.errors';
import { DefinitionsNotFoundException } from '../../lexicon/enrichment/dictionary/dictionary.errors';
import {
  NlpInputInvalidError,
  NlpUnavailableError,
} from '../../lexicon/enrichment/nlp/nlp.errors';
import { PartOfSpeechRequiredError } from './vocabulary.errors';
import { LookupVocabularyDto } from './dto/lookup-vocabulary.dto';
import { LookupVocabularyResponseDto } from './dto/lookup-vocabulary-response.dto';
import { CreateUserDefinitionDto } from './dto/create-user-definition.dto';
import { CreateUserDefinitionResponseDto } from './dto/create-user-definition-response.dto';
import type { LookupVocabularyOutput } from './types/lookup-vocabulary.types';
import type { CreateUserDefinitionOutput } from './types/create-user-definition.types';
import { VocabularyService } from './vocabulary.service';
import {
  captureInputError,
  contextInputError,
  distinctSurfaceTokens,
} from './capture-input';
import {
  SavedMatchesDto,
  SavedMatchesResponseDto,
} from './dto/saved-matches.dto';

@ApiTags('vocabulary')
@ApiBearerAuth('access-token')
@Controller(`${API_V1_PREFIX}/vocabulary`)
@UseGuards(JwtAuthGuard)
export class VocabularyController {
  constructor(private readonly vocabularyService: VocabularyService) {}

  // The route's OpenAPI decorators are counted as part of the method.
  // eslint-disable-next-line max-lines-per-function
  @Get('lookup')
  @ApiOperation({
    summary: 'Look up headwords and definitions with deck membership',
  })
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
    description:
      'Disable the contextual POS preference; alternatives are always returned.',
  })
  @ApiQuery({
    name: 'selectionStart',
    type: Number,
    required: false,
    description:
      'Inclusive Unicode code-point offset in context; requires selectionEnd.',
  })
  @ApiQuery({
    name: 'selectionEnd',
    type: Number,
    required: false,
    description:
      'Exclusive Unicode code-point offset in context; requires selectionStart.',
  })
  @ApiOkResponse({ type: LookupVocabularyResponseDto })
  @ApiUnauthorizedResponse({ description: 'Not authenticated' })
  @ApiNotFoundResponse({ description: 'Definitions not found' })
  @ApiBadRequestResponse({
    description: 'Invalid selection or NLP rejected the input',
  })
  @ApiBadGatewayResponse({
    description: 'NLP service or dictionary provider unavailable',
  })
  async lookup(
    @Query() query: LookupVocabularyDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<LookupVocabularyOutput> {
    try {
      this.throwIfContextTooLong(query.context);
      this.validateSelection(query);
      const { selectionStart, selectionEnd } = query;
      return await this.vocabularyService.lookup({
        word: query.word,
        language: query.language ?? 'en',
        userId: user.userId,
        context: query.context,
        selectionStart:
          selectionStart === undefined ? undefined : Number(selectionStart),
        selectionEnd:
          selectionEnd === undefined ? undefined : Number(selectionEnd),
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

  @Post('saved-matches')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Find the current user's saved vocabulary in capture text",
  })
  @ApiOkResponse({ type: SavedMatchesResponseDto })
  @ApiBadRequestResponse({
    description:
      'CAPTURE_TEXT_TOO_LONG, CAPTURE_TOO_MANY_MEANINGFUL_WORDS, CAPTURE_TOKENS_INVALID, or UNSUPPORTED_LANGUAGE',
  })
  @ApiUnauthorizedResponse({ description: 'Not authenticated' })
  async savedMatches(
    @Body() body: SavedMatchesDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SavedMatchesResponseDto> {
    const inputError = captureInputError(body.text);
    if (inputError) throw new BadRequestException(inputError);
    const expectedTokens = distinctSurfaceTokens(body.text);
    if (
      expectedTokens.length !== body.tokens.length ||
      expectedTokens.some((token, index) => token !== body.tokens[index])
    ) {
      throw new BadRequestException('CAPTURE_TOKENS_INVALID');
    }
    return this.vocabularyService.savedMatches(body, user.userId);
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
      'Validation failure, missing partOfSpeech for a single word, or input rejected by NLP',
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
        definition: body.definition,
        example: body.example,
        partOfSpeech: body.partOfSpeech,
      });
    } catch (err: unknown) {
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

  private validateSelection(query: LookupVocabularyDto): void {
    const { selectionStart, selectionEnd, context, word } = query;
    if (selectionStart !== undefined || selectionEnd !== undefined) {
      const start = Number(selectionStart);
      const end = Number(selectionEnd);
      const chars = Array.from(context ?? '');
      const isWordChar = (char: string) => /[\p{L}\p{N}\p{M}_]/u.test(char);
      if (
        selectionStart === undefined ||
        selectionEnd === undefined ||
        !/^\d+$/.test(selectionStart) ||
        !/^\d+$/.test(selectionEnd) ||
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start >= end ||
        end > chars.length ||
        !context?.trim() ||
        chars.slice(start, end).join('').normalize('NFC').toLowerCase() !==
          word.normalize('NFC').toLowerCase() ||
        (start > 0 && isWordChar(chars[start - 1])) ||
        (end < chars.length && isWordChar(chars[end]))
      )
        throw new BadRequestException('INPUT_INVALID');
    }
  }

  private throwIfContextTooLong(context: string | undefined): void {
    const error = contextInputError(context);
    if (error) throw new BadRequestException(error);
  }
}
