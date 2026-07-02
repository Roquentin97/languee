import type { ChatMessageRole } from './interfaces/chat-bot-adapter.interface';

export type ChatSuggestionType = 'overused_word' | 'grammar' | 'style';

export type ConversationSummary = {
  id: string;
  title: string | null;
  createdAt: Date;
  updatedAt: Date;
  messageCount: number;
};

export type ConversationListItem = ConversationSummary & {
  lastMessagePreview: string | null;
};

export type ConversationMessage = {
  id: string;
  role: ChatMessageRole;
  content: string;
  createdAt: Date;
};

export type ConversationDetail = {
  id: string;
  title: string | null;
  createdAt: Date;
  messages: ConversationMessage[];
};

export type PostMessageResult = {
  userMessage: ConversationMessage;
  assistantMessage: ConversationMessage;
};

export type SuggestionItem = {
  id: string;
  type: ChatSuggestionType;
  title: string;
  detail: string;
  payload: Record<string, unknown> | null;
  createdAt: Date;
};

export type SuggestionsResult = {
  suggestions: SuggestionItem[];
  analyzedAt: Date | null;
};

export type ProgressTypeBreakdown = {
  type: ChatSuggestionType;
  raised: number;
  resolved: number;
};

export type ProgressWeek = {
  weekStart: string;
  raised: number;
  resolved: number;
  userMessages: number;
};

export type ProgressResult = {
  totalRaised: number;
  totalResolved: number;
  totalUserMessages: number;
  activeConversations: number;
  byType: ProgressTypeBreakdown[];
  weeks: ProgressWeek[];
  computedAt: Date | null;
};
