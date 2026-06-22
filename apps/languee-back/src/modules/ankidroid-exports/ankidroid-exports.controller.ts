import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { API_V1_PREFIX } from '../core/api-prefix';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AnkiDroidExportsService } from './ankidroid-exports.service';
import {
  CardNotFoundOrNotOwnedError,
  ExportNotFoundError,
} from './ankidroid-exports.errors';
import { RecordAttemptDto } from './dto/create-export-attempt.dto';
import { AnkiDroidExportResponseDto } from './dto/ankidroid-export-response.dto';
import { AnkiDroidExportDetailResponseDto } from './dto/ankidroid-export-detail-response.dto';
import {
  serializeExport,
  serializeExportDetail,
} from './serializers/ankidroid-export.serializer';

@ApiTags('ankidroid-exports')
@ApiBearerAuth('access-token')
@Controller(API_V1_PREFIX)
@UseGuards(JwtAuthGuard)
export class AnkiDroidExportsController {
  constructor(
    private readonly ankiDroidExportsService: AnkiDroidExportsService,
  ) {}

  @Post('cards/:cardId/ankidroid-exports')
  @ApiOperation({ summary: 'Get or create an AnkiDroid export for a card' })
  @ApiCreatedResponse({
    description: 'Export created',
    type: AnkiDroidExportResponseDto,
  })
  @ApiOkResponse({
    description: 'Export already exists',
    type: AnkiDroidExportResponseDto,
  })
  @ApiNotFoundResponse({ description: 'Card not found or not owned' })
  @ApiUnauthorizedResponse({ description: 'Not authenticated' })
  async getOrCreateExport(
    @Param('cardId') cardId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AnkiDroidExportResponseDto> {
    try {
      const result =
        await this.ankiDroidExportsService.getOrCreateExportForCard(
          user.userId,
          cardId,
        );
      res.status(result.created ? 201 : 200);
      return serializeExport(result.export);
    } catch (err: unknown) {
      if (err instanceof CardNotFoundOrNotOwnedError) {
        throw new NotFoundException('CARD_NOT_FOUND');
      }
      throw err;
    }
  }

  @Get('ankidroid-exports/:id')
  @ApiOperation({ summary: 'Get an AnkiDroid export by id' })
  @ApiOkResponse({ type: AnkiDroidExportDetailResponseDto })
  @ApiNotFoundResponse({ description: 'Export not found' })
  @ApiUnauthorizedResponse({ description: 'Not authenticated' })
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<AnkiDroidExportDetailResponseDto> {
    const record = await this.ankiDroidExportsService.findOneById(
      id,
      user.userId,
    );
    if (record === null) {
      throw new NotFoundException('EXPORT_NOT_FOUND');
    }
    return serializeExportDetail(record);
  }

  @Post('ankidroid-exports/:id/attempts')
  @HttpCode(201)
  @ApiOperation({ summary: 'Record an export attempt' })
  @ApiBody({ type: RecordAttemptDto })
  @ApiCreatedResponse({ type: AnkiDroidExportDetailResponseDto })
  @ApiNotFoundResponse({ description: 'Export not found' })
  @ApiUnauthorizedResponse({ description: 'Not authenticated' })
  async recordAttempt(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: RecordAttemptDto,
  ): Promise<AnkiDroidExportDetailResponseDto> {
    try {
      const updatedExport = await this.ankiDroidExportsService.recordAttempt(
        id,
        user.userId,
        dto,
      );
      return serializeExportDetail(updatedExport);
    } catch (err: unknown) {
      if (err instanceof ExportNotFoundError) {
        throw new NotFoundException('EXPORT_NOT_FOUND');
      }
      throw err;
    }
  }
}
