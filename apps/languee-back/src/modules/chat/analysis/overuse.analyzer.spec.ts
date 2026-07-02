import { analyzeOveruse } from './overuse.analyzer';

describe('analyzeOveruse', () => {
  it('returns an empty array when there are no messages', () => {
    expect(analyzeOveruse([])).toEqual([]);
  });

  it('returns an empty array when messages contain only stopwords', () => {
    const messages = ['the a an and or but i you it is are was'];
    expect(analyzeOveruse(messages)).toEqual([]);
  });

  it('ignores words shorter than 4 letters no matter how often they repeat', () => {
    // "cat" (3 letters) repeated well past both thresholds.
    const messages = [Array(20).fill('cat').join(' ')];
    expect(analyzeOveruse(messages)).toEqual([]);
  });

  it('ignores a stopword that is 4+ letters long no matter how often it repeats', () => {
    // "when" is a stopword and is also >= 4 letters, so this exercises the
    // stopword-skip branch independently from the short-word-skip branch.
    const messages = [Array(20).fill('when').join(' ')];
    expect(analyzeOveruse(messages)).toEqual([]);
  });

  it('flags a word exactly at the count and ratio boundary (count=3, ratio=0.04)', () => {
    const filler = Array(72).fill('the').join(' ');
    const messages = [`banana banana banana ${filler}`];

    const result = analyzeOveruse(messages);

    expect(result).toEqual([{ word: 'banana', count: 3, ratio: 0.04 }]);
  });

  it('does not flag a word below the minimum count even with a high ratio', () => {
    const messages = ['banana banana the the the the the the the the'];
    // count=2, ratio=0.2 — ratio passes but count fails.
    expect(analyzeOveruse(messages)).toEqual([]);
  });

  it('does not flag a word below the minimum ratio even with count >= 3', () => {
    const filler = Array(997).fill('the').join(' ');
    const messages = [`banana banana banana ${filler}`];
    // count=3, total=1000, ratio=0.003 — count passes but ratio fails.
    expect(analyzeOveruse(messages)).toEqual([]);
  });

  it('treats internal apostrophes as part of a single token', () => {
    const filler = Array(72).fill('the').join(' ');
    const messages = [`wouldn't wouldn't wouldn't ${filler}`];

    const result = analyzeOveruse(messages);

    expect(result).toEqual([{ word: "wouldn't", count: 3, ratio: 0.04 }]);
  });

  it('caps results at 5, ordered by count descending', () => {
    // 6 distinct eligible words with distinct counts, all past both thresholds.
    const words = ['apple', 'banana', 'cherry', 'durian', 'grape', 'kiwi'];
    const counts = [10, 9, 8, 7, 6, 5];
    const parts: string[] = [];
    words.forEach((word, i) => {
      parts.push(Array(counts[i]).fill(word).join(' '));
    });
    const messages = [parts.join(' ')];

    const result = analyzeOveruse(messages);

    expect(result).toHaveLength(5);
    expect(result.map((r) => r.word)).toEqual([
      'apple',
      'banana',
      'cherry',
      'durian',
      'grape',
    ]);
    expect(result.map((r) => r.count)).toEqual([10, 9, 8, 7, 6]);
  });

  it('aggregates counts across multiple messages', () => {
    const filler = Array(72).fill('the').join(' ');
    const messages = [`banana banana ${filler}`, 'banana'];

    const result = analyzeOveruse(messages);

    expect(result).toEqual([{ word: 'banana', count: 3, ratio: 3 / 75 }]);
  });
});
