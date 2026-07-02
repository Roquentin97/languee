import type {
  ConversationDetail,
  ConversationListItem,
  ConversationMessage,
  ConversationSummary,
  PostMessageResult,
  SuggestionItem,
  SuggestionsResult,
} from '../chat.types';
import { ChatMessageResponseDto } from '../dto/chat-message-response.dto';
import { ConversationDetailResponseDto } from '../dto/conversation-detail-response.dto';
import {
  ConversationListItemResponseDto,
  ConversationListResponseDto,
} from '../dto/conversation-list-response.dto';
import { CreateConversationResponseDto } from '../dto/create-conversation-response.dto';
import { PostMessageResponseDto } from '../dto/post-message-response.dto';
import {
  ChatSuggestionResponseDto,
  SuggestionsResponseDto,
} from '../dto/suggestions-response.dto';

export function serializeConversationSummary(
  summary: ConversationSummary,
): CreateConversationResponseDto {
  return {
    id: summary.id,
    title: summary.title,
    createdAt: summary.createdAt,
    updatedAt: summary.updatedAt,
    messageCount: summary.messageCount,
  };
}

function serializeConversationListItem(
  item: ConversationListItem,
): ConversationListItemResponseDto {
  return {
    id: item.id,
    title: item.title,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    messageCount: item.messageCount,
    lastMessagePreview: item.lastMessagePreview,
  };
}

export function serializeConversationList(
  items: ConversationListItem[],
): ConversationListResponseDto {
  return { conversations: items.map(serializeConversationListItem) };
}

function serializeMessage(
  message: ConversationMessage,
): ChatMessageResponseDto {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    createdAt: message.createdAt,
  };
}

export function serializeConversationDetail(
  detail: ConversationDetail,
): ConversationDetailResponseDto {
  return {
    id: detail.id,
    title: detail.title,
    createdAt: detail.createdAt,
    messages: detail.messages.map(serializeMessage),
  };
}

export function serializePostMessageResult(
  result: PostMessageResult,
): PostMessageResponseDto {
  return {
    userMessage: serializeMessage(result.userMessage),
    assistantMessage: serializeMessage(result.assistantMessage),
  };
}

function serializeSuggestionItem(
  item: SuggestionItem,
): ChatSuggestionResponseDto {
  return {
    id: item.id,
    type: item.type,
    title: item.title,
    detail: item.detail,
    payload: item.payload,
    createdAt: item.createdAt,
  };
}

export function serializeSuggestions(
  result: SuggestionsResult,
): SuggestionsResponseDto {
  return {
    suggestions: result.suggestions.map(serializeSuggestionItem),
    analyzedAt: result.analyzedAt,
  };
}
