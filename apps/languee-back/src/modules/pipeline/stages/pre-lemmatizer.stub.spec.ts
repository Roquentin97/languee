import { PreLemmatizerStub } from './pre-lemmatizer.stub';

describe('PreLemmatizerStub', () => {
  let stub: PreLemmatizerStub;

  beforeEach(() => {
    stub = new PreLemmatizerStub();
  });

  it('should return lemma equal to normalized_form (happy path)', () => {
    const result = stub.preLemmatize({
      normalized_form: 'running',
      is_multi_word: false,
      pos: null,
    });
    expect(result.lemma).toBe('running');
    expect(result.short_circuited).toBe(false);
  });

  it('edge case 4: lemma must equal normalized.normalized_form', () => {
    const input = { normalized_form: 'quick brown fox', is_multi_word: true, pos: 'noun' };
    const result = stub.preLemmatize(input);
    expect(result.lemma).toBe(input.normalized_form);
  });

  it('edge case 1: empty normalized_form — must not throw', () => {
    expect(() =>
      stub.preLemmatize({ normalized_form: '', is_multi_word: false, pos: null }),
    ).not.toThrow();
  });

  it('edge case 2: multi-word normalized_form — must not throw', () => {
    expect(() =>
      stub.preLemmatize({ normalized_form: 'hello world', is_multi_word: true, pos: null }),
    ).not.toThrow();
  });
});
