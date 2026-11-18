import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadGatewayResponse,
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiBody,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
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
import { rangesReconstructText } from '../capture/capture-ranges';
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

  @Post('lookup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Look up headwords and definitions with deck membership',
  })
  @ApiBody({ type: LookupVocabularyDto })
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
    @Body() query: LookupVocabularyDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<LookupVocabularyOutput> {
    try {
      this.validateLookupInput(query);
      return await this.vocabularyService.lookup({
        text: query.text,
        language: query.language ?? 'en',
        userId: user.userId,
        context: query.context,
        selectionRanges: query.selectionRanges?.map(({ start, end }) => ({
          start,
          end,
        })),
        disablePosFiltering: query.disablePosFiltering ?? false,
        includeSuggestions: query.includeSuggestions ?? true,
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
    if (
      query.selectionRanges !== undefined &&
      !rangesReconstructText(query.context, query.text, query.selectionRanges)
    )
      throw new BadRequestException('INPUT_INVALID');
  }

  private validateLookupInput(query: LookupVocabularyDto): void {
    this.throwIfLookupTooLong(query.text);
    this.throwIfContextTooLong(query.context);
    this.validateSelection(query);
  }

  private throwIfLookupTooLong(text: string): void {
    const components = text.trim().split(/\s+/u).filter(Boolean);
    if (components.length > 6) throw new BadRequestException('INPUT_INVALID');
  }

  private throwIfContextTooLong(context: string | undefined): void {
    const error = contextInputError(context);
    if (error) throw new BadRequestException(error);
  }
}
