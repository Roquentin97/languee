import { truncateGloss } from './definition-hints';

describe('truncateGloss()', () => {
  it('happy path — a short definition is returned untouched', () => {
    expect(truncateGloss('a chance meeting')).toBe('a chance meeting');
  });

  it('edge case — a long definition is truncated with an ellipsis', () => {
    const long =
      'a very long dictionary sense that runs on well past the sixty character gloss limit';

    const result = truncateGloss(long);

    expect(result.endsWith('…')).toBe(true);
    expect(result.length).toBeLessThanOrEqual(61);
  });

  it('edge case — surrounding whitespace is trimmed before measuring length', () => {
    expect(truncateGloss('  a chance meeting  ')).toBe('a chance meeting');
  });
});
