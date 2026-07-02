import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { isUUID } from 'class-validator';
import { API_V1_PREFIX } from '../core/api-prefix';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import { SynonymsService } from './synonyms.service';
import {
  DefinitionNotFoundError,
  MeaningLinkAlreadyExistsError,
  MeaningLinkNotFoundError,
  SelfLinkError,
} from './synonyms.errors';
import { CreateMeaningLinkDto } from './dto/create-meaning-link.dto';
import { ListOverlapsQueryDto } from './dto/list-overlaps-query.dto';
import {
  MeaningLinkListResponseDto,
  MeaningLinkResponseDto,
} from './dto/meaning-link-response.dto';
import { OverlapsResponseDto } from './dto/overlap-response.dto';
import {
  serializeMeaningLink,
  serializeMeaningLinkListItem,
  serializeOverlap,
} from './serializers/meaning-link.serializer';

const MAX_OVERLAP_DEFINITION_IDS = 50;

@ApiTags('synonyms')
@ApiBearerAuth('access-token')
@Controller(`${API_V1_PREFIX}/synonyms`)
@UseGuards(JwtAuthGuard)
export class SynonymsController {
  constructor(private readonly synonymsService: SynonymsService) {}

  @Post()
  @ApiOperation({ summary: 'Link two definitions by meaning' })
  @ApiBody({ type: CreateMeaningLinkDto })
  @ApiCreatedResponse({ type: MeaningLinkResponseDto })
  @ApiBadRequestResponse({ description: 'Self-link or validation error' })
  @ApiNotFoundResponse({ description: 'Unknown definition' })
  @ApiConflictResponse({ description: 'Link already exists' })
  @ApiUnauthorizedResponse({ description: 'Not authenticated' })
  async create(
    @Body() dto: CreateMeaningLinkDto,
  ): Promise<MeaningLinkResponseDto> {
    try {
      const link = await this.synonymsService.createLink({
        definitionAId: dto.definitionAId,
        definitionBId: dto.definitionBId,
        relationType: dto.relationType,
      });
      return serializeMeaningLink(link);
    } catch (err: unknown) {
      if (err instanceof SelfLinkError) {
        throw new BadRequestException('SELF_LINK_NOT_ALLOWED');
      }
      if (err instanceof DefinitionNotFoundError) {
        throw new NotFoundException('DEFINITION_NOT_FOUND');
      }
      if (err instanceof MeaningLinkAlreadyExistsError) {
        throw new ConflictException('MEANING_LINK_ALREADY_EXISTS');
      }
      throw err;
    }
  }

  @Get('definition/:definitionId')
  @ApiOperation({ summary: 'List meaning links for a definition' })
  @ApiParam({
    name: 'definitionId',
    type: String,
    example: 'a2e4529c-cfb7-4f4f-bdb2-0c15e590bf55',
  })
  @ApiOkResponse({ type: MeaningLinkListResponseDto })
  @ApiUnauthorizedResponse({ description: 'Not authenticated' })
  async listForDefinition(
    @Param('definitionId') definitionId: string,
  ): Promise<MeaningLinkListResponseDto> {
    const links =
      await this.synonymsService.listLinksForDefinition(definitionId);
    return { links: links.map(serializeMeaningLinkListItem) };
  }

  @Get('overlaps')
  @ApiOperation({
    summary:
      'Find definitions the user already has cards for that share meaning with the given definitions',
  })
  @ApiQuery({
    name: 'definitionIds',
    type: String,
    required: true,
    example:
      'a2e4529c-cfb7-4f4f-bdb2-0c15e590bf55,1db3f769-e154-44c6-9b98-87de1037a395',
  })
  @ApiOkResponse({ type: OverlapsResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid definitionIds' })
  @ApiUnauthorizedResponse({ description: 'Not authenticated' })
  async findOverlaps(
    @Query() query: ListOverlapsQueryDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<OverlapsResponseDto> {
    const definitionIds = query.definitionIds.split(',').map((id) => id.trim());

    if (
      definitionIds.length < 1 ||
      definitionIds.length > MAX_OVERLAP_DEFINITION_IDS
    ) {
      throw new BadRequestException('DEFINITION_IDS_COUNT_OUT_OF_RANGE');
    }
    if (definitionIds.some((id) => !isUUID(id))) {
      throw new BadRequestException('DEFINITION_IDS_INVALID_UUID');
    }

    const overlaps = await this.synonymsService.findOverlapsForUser(
      user.userId,
      definitionIds,
    );
    return { overlaps: overlaps.map(serializeOverlap) };
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a meaning link' })
  @ApiParam({
    name: 'id',
    type: String,
    example: '9f1c2b3a-4d5e-6f70-8192-a3b4c5d6e7f8',
  })
  @ApiNoContentResponse({ description: 'Meaning link deleted' })
  @ApiNotFoundResponse({ description: 'Meaning link not found' })
  @ApiUnauthorizedResponse({ description: 'Not authenticated' })
  async remove(@Param('id') id: string): Promise<void> {
    try {
      await this.synonymsService.deleteLink(id);
    } catch (err: unknown) {
      if (err instanceof MeaningLinkNotFoundError) {
        throw new NotFoundException('MEANING_LINK_NOT_FOUND');
      }
      throw err;
    }
  }
}
