import { tokenizeWords, tokenizeWordsPreservingCase } from './tokenize';

describe('tokenizeWords', () => {
  it('lowercases and splits on non-letter characters', () => {
    expect(tokenizeWords('Hello, World! 123')).toEqual(['hello', 'world']);
  });

  it('keeps an internal apostrophe as part of a single token', () => {
    expect(tokenizeWords("I don't know.")).toEqual(['i', "don't", 'know']);
  });

  it('returns an empty array when there are no letters at all', () => {
    expect(tokenizeWords('123 456 789!!')).toEqual([]);
  });

  it('returns an empty array for an empty string', () => {
    expect(tokenizeWords('')).toEqual([]);
  });
});

describe('tokenizeWordsPreservingCase', () => {
  it('splits on non-letter characters while preserving original casing', () => {
    expect(tokenizeWordsPreservingCase('Hello, World!')).toEqual([
      'Hello',
      'World',
    ]);
  });

  it('keeps an internal apostrophe as part of a single token', () => {
    expect(tokenizeWordsPreservingCase("Don't stop.")).toEqual([
      "Don't",
      'stop',
    ]);
  });

  it('returns an empty array when there are no letters at all', () => {
    expect(tokenizeWordsPreservingCase('123 456!')).toEqual([]);
  });
});
