export type ChatMessageRole = 'user' | 'assistant';

export interface ChatBotAdapterInput {
  conversationId: string;
  history: Array<{ role: ChatMessageRole; content: string }>;
  userMessage: string;
}

/**
 * Pluggable adapter for any chat bot provider.
 * The stub adapter implements deterministic language-tutor behavior; real
 * providers slot in later behind this same seam.
 */
export interface IChatBotAdapter {
  readonly providerName: string;
  reply(input: ChatBotAdapterInput): Promise<string>;
}
