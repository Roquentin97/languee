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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ProviderUnavailableError } from '../definitions/definitions.errors';
import { DefinitionsNotFoundException } from './dictionary.errors';
import { LookupWordDto } from './dto/lookup-word.dto';
import { LookupWordResponseDto } from './dto/lookup-word-response.dto';
import type { LookupWordOutput } from './types/lookup-word.types';
import { DictionaryService } from './dictionary.service';

@ApiTags('dictionary')
@ApiBearerAuth('access-token')
@Controller('dictionary')
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
  @ApiNotFoundResponse({ description: 'Definitions not found' })
  @ApiBadGatewayResponse({ description: 'Dictionary provider unavailable' })
  async lookup(@Query() query: LookupWordDto): Promise<LookupWordOutput> {
    try {
      return await this.dictionaryService.lookup({
        word: query.word,
        language: query.language ?? 'en',
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
