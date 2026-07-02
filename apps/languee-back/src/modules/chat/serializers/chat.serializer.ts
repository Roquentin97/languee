import type {
  ConversationDetail,
  ConversationListItem,
  ConversationMessage,
  ConversationSummary,
  PostMessageResult,
  ProgressResult,
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
import { ProgressResponseDto } from '../dto/progress-response.dto';
import {
  ChatSuggestionResponseDto,
  SuggestionsResponseDto,
} from '../dto/suggestions-response.dto';

const RESOLUTION_RATE_DECIMALS = 2;

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

export function serializeProgress(result: ProgressResult): ProgressResponseDto {
  const resolutionRate =
    result.totalRaised === 0
      ? null
      : roundTo(
          result.totalResolved / result.totalRaised,
          RESOLUTION_RATE_DECIMALS,
        );

  return {
    totals: {
      suggestionsRaised: result.totalRaised,
      suggestionsResolved: result.totalResolved,
      resolutionRate,
      userMessages: result.totalUserMessages,
      activeConversations: result.activeConversations,
    },
    byType: result.byType.map((b) => ({
      type: b.type,
      raised: b.raised,
      resolved: b.resolved,
    })),
    weeks: result.weeks.map((w) => ({
      weekStart: w.weekStart,
      raised: w.raised,
      resolved: w.resolved,
      userMessages: w.userMessages,
    })),
    computedAt: result.computedAt,
  };
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
