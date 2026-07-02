import { StubChatBotAdapter } from './stub-chat-bot.adapter';

describe('StubChatBotAdapter', () => {
  let adapter: StubChatBotAdapter;

  beforeEach(() => {
    adapter = new StubChatBotAdapter();
  });

  it('exposes providerName "stub"', () => {
    expect(adapter.providerName).toBe('stub');
  });

  it('greets and asks what the user wants to talk about on the first reply (empty history)', async () => {
    const reply = await adapter.reply({
      conversationId: 'conv-1',
      history: [],
      userMessage: 'Hello there!',
    });

    expect(reply).toBe(
      "Hi! I'm your practice partner. What would you like to talk about today?",
    );
  });

  it('quotes the last sentence of the user message on subsequent replies', async () => {
    const reply = await adapter.reply({
      conversationId: 'conv-1',
      history: [
        { role: 'user', content: 'Hi' },
        { role: 'assistant', content: 'Hello!' },
      ],
      userMessage: 'I went to the store. I bought some milk.',
    });

    expect(reply).toContain('"I bought some milk."');
  });

  it('truncates a long final sentence fragment to ~60 characters', async () => {
    const longSentence =
      'This is a very long sentence that definitely goes past sixty characters in length for sure.';

    const reply = await adapter.reply({
      conversationId: 'conv-1',
      history: [
        { role: 'user', content: 'Hi' },
        { role: 'assistant', content: 'Hello!' },
      ],
      userMessage: longSentence,
    });

    const quoted = /"([^"]*)"/.exec(reply);
    expect(quoted).not.toBeNull();
    expect(quoted?.[1].length).toBeLessThanOrEqual(60);
    expect(quoted?.[1].endsWith('…')).toBe(true);
  });

  it('falls back to the trimmed full message when it has no terminal punctuation', async () => {
    const reply = await adapter.reply({
      conversationId: 'conv-1',
      history: [
        { role: 'user', content: 'Hi' },
        { role: 'assistant', content: 'Hello!' },
      ],
      userMessage: 'just some words with no punctuation',
    });

    expect(reply).toContain('"just some words with no punctuation"');
  });

  it('rotates deterministically through the 5 follow-up templates based on history length', async () => {
    const historiesOfLength = [2, 4, 6, 8, 10];
    const replies = await Promise.all(
      historiesOfLength.map((length) =>
        adapter.reply({
          conversationId: 'conv-1',
          history: Array.from({ length }, (_, i) => ({
            role: i % 2 === 0 ? ('user' as const) : ('assistant' as const),
            content: 'x',
          })),
          userMessage: 'Testing rotation.',
        }),
      ),
    );

    // 5 different history lengths modulo 5 templates should produce 5 distinct
    // follow-up endings since gcd(2, 5) === 1.
    const uniqueReplies = new Set(replies);
    expect(uniqueReplies.size).toBe(5);
  });

  it('falls back to the trimmed message when it has no sentence content at all', async () => {
    const reply = await adapter.reply({
      conversationId: 'conv-1',
      history: [
        { role: 'user', content: 'Hi' },
        { role: 'assistant', content: 'Hello!' },
      ],
      userMessage: '   ',
    });

    expect(reply).toContain('""');
  });

  it('is deterministic: identical input always produces identical output', async () => {
    const input = {
      conversationId: 'conv-1',
      history: [
        { role: 'user' as const, content: 'Hi' },
        { role: 'assistant' as const, content: 'Hello!' },
      ],
      userMessage: 'Repeat me please.',
    };

    const first = await adapter.reply(input);
    const second = await adapter.reply(input);

    expect(first).toBe(second);
  });
});
