export class ChatConversationNotFoundError extends Error {
  constructor() {
    super('Conversation not found or does not belong to this user');
    this.name = 'ChatConversationNotFoundError';
  }
}
