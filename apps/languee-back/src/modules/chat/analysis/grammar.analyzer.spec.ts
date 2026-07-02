import { analyzeGrammar } from './grammar.analyzer';

describe('analyzeGrammar', () => {
  it('returns an empty array when there are no messages', () => {
    expect(analyzeGrammar([])).toEqual([]);
  });

  it('flags a duplicated consecutive word within a sentence', () => {
    const findings = analyzeGrammar([
      { id: 'm1', content: 'I saw the the dog.' },
    ]);

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      rule: 'duplicated_word',
      messageId: 'm1',
    });
  });

  it('does NOT flag a duplicated word that spans a sentence boundary', () => {
    const findings = analyzeGrammar([
      { id: 'm1', content: 'I love cats. Cats are cute.' },
    ]);

    expect(findings.some((f) => f.rule === 'duplicated_word')).toBe(false);
  });

  it('flags "a" before a word starting with a vowel letter', () => {
    const findings = analyzeGrammar([
      { id: 'm1', content: 'I saw a elephant yesterday.' },
    ]);

    const finding = findings.find((f) => f.rule === 'article_misuse');
    expect(finding).toBeDefined();
    expect(finding?.detail).toContain('an elephant');
  });

  it('flags "an" before a word starting with a consonant letter (letter-heuristic limitation: "an hour" is correct English but gets flagged)', () => {
    const findings = analyzeGrammar([
      { id: 'm1', content: 'I waited for an hour.' },
    ]);

    const finding = findings.find((f) => f.rule === 'article_misuse');
    expect(finding).toBeDefined();
    expect(finding?.detail).toContain('a hour');
  });

  it('skips article misuse when the next word is an acronym', () => {
    const findings = analyzeGrammar([
      { id: 'm1', content: 'She is an FBI agent.' },
    ]);

    expect(findings.some((f) => f.rule === 'article_misuse')).toBe(false);
  });

  it('skips article misuse when the next word is a single letter', () => {
    const findings = analyzeGrammar([{ id: 'm1', content: 'Give me a Q.' }]);

    expect(findings.some((f) => f.rule === 'article_misuse')).toBe(false);
  });

  it('flags a standalone lowercase "i"', () => {
    const findings = analyzeGrammar([
      { id: 'm1', content: 'Something happened and i was surprised.' },
    ]);

    expect(findings.some((f) => f.rule === 'lowercase_i')).toBe(true);
  });

  it('flags a sentence starting with a lowercase letter', () => {
    const findings = analyzeGrammar([
      { id: 'm1', content: 'hello there. How are you?' },
    ]);

    const finding = findings.find((f) => f.rule === 'sentence_case');
    expect(finding).toBeDefined();
  });

  it('does not flag a sentence starting with a non-alphabetic character', () => {
    const findings = analyzeGrammar([
      { id: 'm1', content: '"Well," she said, "that is odd."' },
    ]);

    expect(findings.some((f) => f.rule === 'sentence_case')).toBe(false);
  });

  it('flags a message of >= 8 words with no terminal punctuation', () => {
    const findings = analyzeGrammar([
      { id: 'm1', content: 'This is a test message with eight words' },
    ]);

    expect(
      findings.some((f) => f.rule === 'missing_terminal_punctuation'),
    ).toBe(true);
  });

  it('does not flag a message of 7 words with no terminal punctuation (below threshold)', () => {
    const findings = analyzeGrammar([
      { id: 'm1', content: 'This is a test with seven word' },
    ]);

    expect(
      findings.some((f) => f.rule === 'missing_terminal_punctuation'),
    ).toBe(false);
  });

  it('does not flag a message of >= 8 words that ends with terminal punctuation', () => {
    const findings = analyzeGrammar([
      { id: 'm1', content: 'This is a test message with eight words.' },
    ]);

    expect(
      findings.some((f) => f.rule === 'missing_terminal_punctuation'),
    ).toBe(false);
  });

  it('stops scanning subsequent sentences within the same message once the cap is reached', () => {
    const findings = analyzeGrammar([
      {
        id: 'm1',
        content:
          'i saw a elephant and a elephant again. i am here. ' +
          'This sentence should never be scanned because the cap was already reached.',
      },
    ]);

    expect(findings).toHaveLength(5);
    expect(findings.some((f) => f.excerpt.includes('never be scanned'))).toBe(
      false,
    );
  });

  it('caps total findings at 5 across messages', () => {
    const messages = [
      { id: 'm1', content: 'i saw a elephant and a elephant again.' },
      { id: 'm2', content: 'i saw a elephant and a elephant again.' },
      { id: 'm3', content: 'i saw a elephant and a elephant again.' },
    ];

    const findings = analyzeGrammar(messages);

    expect(findings.length).toBeLessThanOrEqual(5);
  });

  it('truncates a long excerpt to at most 80 characters', () => {
    const longMessage =
      'This is a very long message without any terminal punctuation at the end of it whatsoever';

    const findings = analyzeGrammar([{ id: 'm1', content: longMessage }]);

    const finding = findings.find(
      (f) => f.rule === 'missing_terminal_punctuation',
    );
    expect(finding).toBeDefined();
    expect(finding?.excerpt.length).toBeLessThanOrEqual(80);
  });
});
