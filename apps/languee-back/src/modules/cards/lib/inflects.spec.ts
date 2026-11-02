import { wordInflects } from './inflects';

describe('wordInflects()', () => {
  it('happy path — a verb with a past form inflects', () => {
    expect(wordInflects({ type: 'verb', base: 'run', past: 'ran' })).toBe(true);
  });

  it('edge case — a verb with only a base form does not inflect', () => {
    expect(wordInflects({ type: 'verb', base: 'must' })).toBe(false);
  });

  it('happy path — a noun with a plural inflects', () => {
    expect(
      wordInflects({ type: 'noun', singular: 'owl', plural: 'owls' }),
    ).toBe(true);
  });

  it('edge case — a mass noun with no plural does not inflect', () => {
    expect(wordInflects({ type: 'noun', singular: 'water' })).toBe(false);
  });

  it('happy path — an adjective with a comparative inflects', () => {
    expect(
      wordInflects({
        type: 'adjective',
        positive: 'good',
        comparative: 'better',
      }),
    ).toBe(true);
  });

  it('edge case — an adjective with no comparative or superlative does not inflect', () => {
    expect(wordInflects({ type: 'adjective', positive: 'unique' })).toBe(false);
  });

  it('edge case — expressions never inflect', () => {
    expect(wordInflects({ type: 'expression', contextForm: 'ran into' })).toBe(
      false,
    );
  });

  it('edge case — null or undefined never inflects', () => {
    expect(wordInflects(null)).toBe(false);
    expect(wordInflects(undefined)).toBe(false);
  });
});
