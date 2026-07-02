import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
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
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { API_V1_PREFIX } from '../core/api-prefix';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import { ReviewsService } from './reviews.service';
import { CardOwnershipError, DeckOwnershipError } from './reviews.errors';
import { AnswerCardDto } from './dto/answer-card.dto';
import { GradeCardDto } from './dto/grade-card.dto';
import { ReviewQueueQueryDto } from './dto/review-queue-query.dto';
import { ReviewSummaryResponseDto } from './dto/review-summary-response.dto';
import { ReviewQueueResponseDto } from './dto/review-queue-response.dto';
import { AnswerCardResponseDto } from './dto/answer-card-response.dto';
import { GradeCardResponseDto } from './dto/grade-card-response.dto';
import {
  serializeAnswerResult,
  serializeGradeResult,
  serializeQueue,
  serializeSummary,
} from './serializers/review.serializer';

const DEFAULT_QUEUE_LIMIT = 20;
const MAX_QUEUE_LIMIT = 100;

@ApiTags('reviews')
@ApiBearerAuth('access-token')
@Controller(`${API_V1_PREFIX}/reviews`)
@UseGuards(JwtAuthGuard)
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get('summary')
  @ApiOperation({
    summary: 'Get due and new review counts for the current user',
  })
  @ApiOkResponse({ type: ReviewSummaryResponseDto })
  @ApiUnauthorizedResponse({ description: 'Not authenticated' })
  async summary(
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<ReviewSummaryResponseDto> {
    const summary = await this.reviewsService.getSummary(user.userId);
    return serializeSummary(summary);
  }

  @Get('queue')
  @ApiOperation({ summary: 'Get the review queue for the current user' })
  @ApiQuery({
    name: 'deckId',
    type: String,
    required: false,
    example: '1db3f769-e154-44c6-9b98-87de1037a395',
  })
  @ApiQuery({
    name: 'limit',
    type: Number,
    required: false,
    example: 20,
    description: 'Defaults to 20, capped at 100',
  })
  @ApiOkResponse({ type: ReviewQueueResponseDto })
  @ApiNotFoundResponse({ description: 'Deck not found' })
  @ApiUnauthorizedResponse({ description: 'Not authenticated' })
  async queue(
    @Query() query: ReviewQueueQueryDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<ReviewQueueResponseDto> {
    const parsedLimit =
      query.limit !== undefined
        ? Number.parseInt(query.limit, 10)
        : DEFAULT_QUEUE_LIMIT;
    const limit = Math.max(1, Math.min(parsedLimit, MAX_QUEUE_LIMIT));

    try {
      const items = await this.reviewsService.getQueue(user.userId, {
        deckId: query.deckId,
        limit,
      });
      return serializeQueue(items);
    } catch (err: unknown) {
      if (err instanceof DeckOwnershipError) {
        throw new NotFoundException('DECK_NOT_FOUND');
      }
      throw err;
    }
  }

  @Post(':cardId/answer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Check a typed answer without mutating review state',
  })
  @ApiParam({
    name: 'cardId',
    type: String,
    example: '1db3f769-e154-44c6-9b98-87de1037a395',
  })
  @ApiBody({ type: AnswerCardDto })
  @ApiOkResponse({ type: AnswerCardResponseDto })
  @ApiBadRequestResponse({ description: 'Blank typed answer' })
  @ApiNotFoundResponse({ description: 'Card not found' })
  @ApiUnauthorizedResponse({ description: 'Not authenticated' })
  async answer(
    @Param('cardId') cardId: string,
    @Body() dto: AnswerCardDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<AnswerCardResponseDto> {
    try {
      const outcome = await this.reviewsService.checkTypedAnswer(
        user.userId,
        cardId,
        dto.typedAnswer,
      );
      return serializeAnswerResult(outcome);
    } catch (err: unknown) {
      if (err instanceof CardOwnershipError) {
        throw new NotFoundException('CARD_NOT_FOUND');
      }
      throw err;
    }
  }

  @Post(':cardId/grade')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Grade a review and schedule the next due date via SM-2',
  })
  @ApiParam({
    name: 'cardId',
    type: String,
    example: '1db3f769-e154-44c6-9b98-87de1037a395',
  })
  @ApiBody({ type: GradeCardDto })
  @ApiOkResponse({ type: GradeCardResponseDto })
  @ApiNotFoundResponse({ description: 'Card not found' })
  @ApiUnauthorizedResponse({ description: 'Not authenticated' })
  async grade(
    @Param('cardId') cardId: string,
    @Body() dto: GradeCardDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<GradeCardResponseDto> {
    try {
      const result = await this.reviewsService.gradeCard(user.userId, cardId, {
        rating: dto.rating,
        typedAnswer: dto.typedAnswer,
        answerResult: dto.answerResult,
      });
      return serializeGradeResult(result);
    } catch (err: unknown) {
      if (err instanceof CardOwnershipError) {
        throw new NotFoundException('CARD_NOT_FOUND');
      }
      throw err;
    }
  }
}
