import {
  BadGatewayException,
  Controller,
  Get,
  NotFoundException,
  Query,
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
} from '@nestjs/swagger';
import { API_V1_PREFIX } from '../core/api-prefix';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ProviderUnavailableError } from '../definitions/definitions.errors';
import { DefinitionsNotFoundException } from './dictionary.errors';
import { LookupWordDto } from './dto/lookup-word.dto';
import { LookupWordResponseDto } from './dto/lookup-word-response.dto';
import type { LookupWordOutput } from './types/lookup-word.types';
import { DictionaryService } from './dictionary.service';

@ApiTags('dictionary')
@ApiBearerAuth('access-token')
@Controller(`${API_V1_PREFIX}/dictionary`)
@UseGuards(JwtAuthGuard)
export class DictionaryController {
  constructor(private readonly dictionaryService: DictionaryService) {}

  @Get('lookup')
  @ApiOperation({ summary: 'Look up dictionary definitions for a word' })
  @ApiQuery({ name: 'word', type: String, required: true, example: 'running' })
  @ApiQuery({
    name: 'language',
    type: String,
    required: false,
    example: 'en',
    description: 'ISO 639-1 language code. Defaults to en.',
  })
  @ApiOkResponse({ type: LookupWordResponseDto })
  @ApiUnauthorizedResponse({ description: 'Not authenticated' })
  @ApiNotFoundResponse({
    description: 'No dictionary definitions were found for this word.',
  })
  @ApiBadGatewayResponse({
    description:
      'Dictionary lookup is temporarily unavailable. Please try again later.',
  })
  async lookup(@Query() query: LookupWordDto): Promise<LookupWordOutput> {
    try {
      return await this.dictionaryService.lookup({
        word: query.word,
        language: query.language ?? 'en',
      });
    } catch (e: unknown) {
      if (e instanceof DefinitionsNotFoundException) {
        throw new NotFoundException({
          message: 'No dictionary definitions were found for this word.',
          error: 'DICTIONARY_DEFINITIONS_NOT_FOUND',
        });
      }
      if (e instanceof ProviderUnavailableError) {
        throw new BadGatewayException({
          message:
            'Dictionary lookup is temporarily unavailable. Please try again later.',
          error: 'DICTIONARY_PROVIDER_UNAVAILABLE',
        });
      }
      throw e;
    }
  }
}
