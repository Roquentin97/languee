import { fingerprintOf } from './fingerprint';

describe('fingerprintOf', () => {
  it('fingerprints overused_word by the word field, lowercased', () => {
    const fp = fingerprintOf({
      type: 'overused_word',
      title: 'You used "Basically" 5 times',
      payload: { word: 'Basically', count: 5, ratio: 0.1, synonyms: [] },
    });
    expect(fp).toBe('overused_word:basically');
  });

  it('is stable across different counts/ratios for the same word', () => {
    const a = fingerprintOf({
      type: 'overused_word',
      title: 'x',
      payload: { word: 'apple', count: 3 },
    });
    const b = fingerprintOf({
      type: 'overused_word',
      title: 'x',
      payload: { word: 'apple', count: 9 },
    });
    expect(a).toBe(b);
  });

  it('fingerprints grammar by rule only, ignoring which word/excerpt triggered it', () => {
    const a = fingerprintOf({
      type: 'grammar',
      title: 'Repeated word: "the"',
      payload: { rule: 'duplicated_word', excerpt: 'the the cat' },
    });
    const b = fingerprintOf({
      type: 'grammar',
      title: 'Repeated word: "very"',
      payload: { rule: 'duplicated_word', excerpt: 'very very tired' },
    });
    expect(a).toBe(b);
    expect(a).toBe('grammar:duplicated_word');
  });

  it('fingerprints style repeated_phrase by the phrase field', () => {
    const fp = fingerprintOf({
      type: 'style',
      title: 'Repeated phrase: "i want to"',
      payload: { phrase: 'I Want To', count: 3 },
    });
    expect(fp).toBe('style:i want to');
  });

  it('fingerprints style repeated_sentence_starter by the word field', () => {
    const fp = fingerprintOf({
      type: 'style',
      title: 'Sentences repeatedly start with "so"',
      payload: { word: 'So', count: 4 },
    });
    expect(fp).toBe('style:so');
  });

  it('falls back to the excerpt for long_sentence payloads (no shared pattern field)', () => {
    const fp = fingerprintOf({
      type: 'style',
      title: 'Long sentence',
      payload: { wordCount: 35, excerpt: 'This is a very long sentence...' },
    });
    expect(fp).toBe('style:this is a very long sentence...');
  });

  it('falls back to the normalized title when payload has none of the known fields', () => {
    const fp = fingerprintOf({
      type: 'style',
      title: 'Some Future Style Issue',
      payload: { somethingElse: 1 },
    });
    expect(fp).toBe('style:some future style issue');
  });

  it('treats a null payload as empty', () => {
    const fp = fingerprintOf({
      type: 'style',
      title: 'Fallback Title',
      payload: null,
    });
    expect(fp).toBe('style:fallback title');
  });
});
