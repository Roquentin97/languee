import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { API_V1_PREFIX } from '../core/api-prefix';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import { ChatService } from './chat.service';
import { ChatConversationNotFoundError } from './chat.errors';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { CreateConversationResponseDto } from './dto/create-conversation-response.dto';
import { ConversationListResponseDto } from './dto/conversation-list-response.dto';
import { ConversationDetailResponseDto } from './dto/conversation-detail-response.dto';
import { PostMessageDto } from './dto/post-message.dto';
import { PostMessageResponseDto } from './dto/post-message-response.dto';
import { SuggestionsResponseDto } from './dto/suggestions-response.dto';
import {
  serializeConversationDetail,
  serializeConversationList,
  serializeConversationSummary,
  serializePostMessageResult,
  serializeSuggestions,
} from './serializers/chat.serializer';

@ApiTags('chat')
@ApiBearerAuth('access-token')
@Controller(`${API_V1_PREFIX}/chat/conversations`)
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post()
  @ApiOperation({ summary: 'Start a new chat conversation' })
  @ApiBody({ type: CreateConversationDto })
  @ApiCreatedResponse({ type: CreateConversationResponseDto })
  @ApiUnauthorizedResponse({ description: 'Not authenticated' })
  async create(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateConversationDto,
  ): Promise<CreateConversationResponseDto> {
    const conversation = await this.chatService.createConversation(
      user.userId,
      dto.title,
    );
    return serializeConversationSummary(conversation);
  }

  @Get()
  @ApiOperation({ summary: 'List chat conversations for the current user' })
  @ApiOkResponse({ type: ConversationListResponseDto })
  @ApiUnauthorizedResponse({ description: 'Not authenticated' })
  async list(
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<ConversationListResponseDto> {
    const conversations = await this.chatService.listConversations(user.userId);
    return serializeConversationList(conversations);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a chat conversation with its messages' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiOkResponse({ type: ConversationDetailResponseDto })
  @ApiNotFoundResponse({ description: 'Conversation not found' })
  @ApiUnauthorizedResponse({ description: 'Not authenticated' })
  async getOne(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<ConversationDetailResponseDto> {
    try {
      const conversation = await this.chatService.getConversation(
        user.userId,
        id,
      );
      return serializeConversationDetail(conversation);
    } catch (err: unknown) {
      if (err instanceof ChatConversationNotFoundError) {
        throw new NotFoundException('CHAT_CONVERSATION_NOT_FOUND');
      }
      throw err;
    }
  }

  @Post(':id/messages')
  @ApiOperation({
    summary: 'Post a message to a conversation and get the bot reply',
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiBody({ type: PostMessageDto })
  @ApiCreatedResponse({ type: PostMessageResponseDto })
  @ApiNotFoundResponse({ description: 'Conversation not found' })
  @ApiUnauthorizedResponse({ description: 'Not authenticated' })
  async postMessage(
    @Param('id') id: string,
    @Body() dto: PostMessageDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<PostMessageResponseDto> {
    try {
      const result = await this.chatService.postMessage(
        user.userId,
        id,
        dto.content,
      );
      return serializePostMessageResult(result);
    } catch (err: unknown) {
      if (err instanceof ChatConversationNotFoundError) {
        throw new NotFoundException('CHAT_CONVERSATION_NOT_FOUND');
      }
      throw err;
    }
  }

  @Get(':id/suggestions')
  @ApiOperation({ summary: 'Get analysis suggestions for a conversation' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiOkResponse({ type: SuggestionsResponseDto })
  @ApiNotFoundResponse({ description: 'Conversation not found' })
  @ApiUnauthorizedResponse({ description: 'Not authenticated' })
  async getSuggestions(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuggestionsResponseDto> {
    try {
      const result = await this.chatService.getSuggestions(user.userId, id);
      return serializeSuggestions(result);
    } catch (err: unknown) {
      if (err instanceof ChatConversationNotFoundError) {
        throw new NotFoundException('CHAT_CONVERSATION_NOT_FOUND');
      }
      throw err;
    }
  }
}
