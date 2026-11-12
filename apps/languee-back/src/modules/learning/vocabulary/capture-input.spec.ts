import {
  captureInputError,
  contextInputError,
  distinctSurfaceTokens,
  meaningfulWordCount,
} from './capture-input';

describe('capture input', () => {
  it('normalizes Unicode and excludes function words from the distinct allowance', () => {
    expect(distinctSurfaceTokens('The Café cafe\u0301 expressways')).toEqual([
      'the',
      'café',
      'expressways',
    ]);
    expect(meaningfulWordCount('The Café cafe\u0301 expressways')).toBe(2);
  });

  it('accepts fifteen meaningful words and rejects sixteen', () => {
    const terms = (count: number) =>
      Array.from(
        { length: count },
        (_, index) => `term${String.fromCharCode(97 + index)}`,
      ).join(' ');
    expect(captureInputError(terms(15))).toBeNull();
    expect(captureInputError(terms(16))).toBe(
      'CAPTURE_TOO_MANY_MEANINGFUL_WORDS',
    );
  });

  it('uses UTF-8 bytes for context limits', () => {
    expect(contextInputError('😀'.repeat(256))).toBeNull();
    expect(contextInputError('😀'.repeat(257))).toBe('CONTEXT_TOO_LONG');
  });
});
