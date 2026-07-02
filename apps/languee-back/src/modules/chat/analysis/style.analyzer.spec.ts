import { analyzeStyle } from './style.analyzer';

function repeatWords(word: string, count: number): string {
  return Array(count).fill(word).join(' ');
}

describe('analyzeStyle', () => {
  it('returns an empty array when there are no messages', () => {
    expect(analyzeStyle([])).toEqual([]);
  });

  it('flags a non-stopword sentence starter repeated 3+ times', () => {
    const messages = [
      'Basically I went home. Basically I ate dinner. Basically I slept.',
    ];

    const findings = analyzeStyle(messages);

    const finding = findings.find(
      (f) => f.pattern === 'repeated_sentence_starter',
    );
    expect(finding).toBeDefined();
    expect(finding?.payload).toEqual({ word: 'basically', count: 3 });
  });

  it('does not flag a sentence starter repeated only twice (below threshold)', () => {
    const messages = ['Basically I went home. Basically I ate dinner.'];

    const findings = analyzeStyle(messages);

    expect(
      findings.some((f) => f.pattern === 'repeated_sentence_starter'),
    ).toBe(false);
  });

  it('does not flag a stopword sentence starter no matter how often it repeats', () => {
    const messages = ['The cat sat. The dog ran. The bird flew.'];

    const findings = analyzeStyle(messages);

    expect(
      findings.some((f) => f.pattern === 'repeated_sentence_starter'),
    ).toBe(false);
  });

  it('flags a sentence with more than 30 words', () => {
    const longSentence = `${repeatWords('word', 31)}.`;

    const findings = analyzeStyle([longSentence]);

    const finding = findings.find((f) => f.pattern === 'long_sentence');
    expect(finding).toBeDefined();
    expect(finding?.payload['wordCount']).toBe(31);
  });

  it('does not flag a sentence with exactly 30 words', () => {
    const sentence = `${repeatWords('word', 30)}.`;

    const findings = analyzeStyle([sentence]);

    expect(findings.some((f) => f.pattern === 'long_sentence')).toBe(false);
  });

  it('flags an exact 3-word phrase repeated 3+ times', () => {
    const messages = [
      'I really like coffee. I really like tea. I really like tea again.',
    ];

    const findings = analyzeStyle(messages);

    const finding = findings.find((f) => f.pattern === 'repeated_phrase');
    expect(finding).toBeDefined();
    expect(finding?.payload['phrase']).toBe('i really like');
    expect(finding?.payload['count']).toBe(3);
  });

  it('does not flag a 3-word phrase repeated only twice (below threshold)', () => {
    const messages = ['I really like coffee. I really like tea.'];

    const findings = analyzeStyle(messages);

    expect(findings.some((f) => f.pattern === 'repeated_phrase')).toBe(false);
  });

  it('does not count a phrase spanning a sentence boundary', () => {
    // "cats are cute" would only form if words from two different sentences
    // were joined; since phrase detection is per-sentence, this must never
    // be counted.
    const messages = ['I love cats. Are cute animals rare here.'];

    const findings = analyzeStyle(messages);

    expect(
      findings.some(
        (f) =>
          f.pattern === 'repeated_phrase' &&
          f.payload['phrase'] === 'cats are cute',
      ),
    ).toBe(false);
  });

  it('caps total findings at 5 even when 6 sentence-starter groups qualify', () => {
    const starters = [
      'Basically',
      'Honestly',
      'Clearly',
      'Actually',
      'Certainly',
      'Frankly',
    ];
    const sentence = (starter: string, word: string): string =>
      `${starter} did ${word}.`;

    const messages = starters.map((starter) =>
      ['alpha', 'beta', 'gamma']
        .map((word) => sentence(starter, word))
        .join(' '),
    );

    const findings = analyzeStyle(messages);

    expect(findings.length).toBe(5);
    expect(
      findings.every((f) => f.pattern === 'repeated_sentence_starter'),
    ).toBe(true);
  });
});
