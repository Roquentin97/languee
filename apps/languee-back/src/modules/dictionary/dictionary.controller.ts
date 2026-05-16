import {
  BadGatewayException,
  Controller,
  Get,
  NotFoundException,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ProviderUnavailableError } from '../definitions/definitions.errors';
import { DefinitionsNotFoundException } from './dictionary.errors';
import { LookupWordDto } from './dto/lookup-word.dto';
import type { LookupWordOutput } from './types/lookup-word.types';
import { DictionaryService } from './dictionary.service';

@Controller('dictionary')
@UseGuards(JwtAuthGuard)
export class DictionaryController {
  constructor(private readonly dictionaryService: DictionaryService) {}

  @Get('lookup')
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
