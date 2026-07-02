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
