import { Injectable } from '@nestjs/common';
import type {
  ChatBotAdapterInput,
  IChatBotAdapter,
} from '../interfaces/chat-bot-adapter.interface';

const GREETING =
  "Hi! I'm your practice partner. What would you like to talk about today?";

const FOLLOW_UP_TEMPLATES = [
  'Tell me more about that.',
  'Why do you think that?',
  'How did that make you feel?',
  'Could you describe that differently?',
  "That's interesting — what happened next?",
];

const MAX_FRAGMENT_LENGTH = 60;

/**
 * Deterministic stub chat bot. No randomness: template rotation is derived
 * from the length of the prior conversation history so behavior is
 * reproducible and unit-testable. Real providers slot in later behind
 * IChatBotAdapter.
 */
@Injectable()
export class StubChatBotAdapter implements IChatBotAdapter {
  readonly providerName = 'stub';

  reply(input: ChatBotAdapterInput): Promise<string> {
    if (input.history.length === 0) {
      return Promise.resolve(GREETING);
    }

    const templateIndex = input.history.length % FOLLOW_UP_TEMPLATES.length;
    const followUp = FOLLOW_UP_TEMPLATES[templateIndex];
    const fragment = this.extractFragment(input.userMessage);

    return Promise.resolve(`I hear you — "${fragment}" ${followUp}`);
  }

  private extractFragment(message: string): string {
    const sentences = message
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    const last = sentences[sentences.length - 1] ?? message.trim();

    return last.length > MAX_FRAGMENT_LENGTH
      ? `${last.slice(0, MAX_FRAGMENT_LENGTH - 1)}…`
      : last;
  }
}
