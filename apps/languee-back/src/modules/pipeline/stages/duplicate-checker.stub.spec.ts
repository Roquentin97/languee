import { DuplicateCheckerStub } from './duplicate-checker.stub';

describe('DuplicateCheckerStub', () => {
  let stub: DuplicateCheckerStub;

  beforeEach(() => {
    stub = new DuplicateCheckerStub();
  });

  it('should always return an empty array (happy path)', () => {
    const result = stub.check({ lemma: 'run' });
    expect(result).toEqual([]);
  });

  it('edge case 6: must always return an empty array regardless of input', () => {
    expect(stub.check({ lemma: '' })).toEqual([]);
    expect(stub.check({ lemma: 'hello world' })).toEqual([]);
    expect(stub.check({ lemma: 'anything' })).toEqual([]);
  });

  it('edge case 1: empty string input — must not throw', () => {
    expect(() => stub.check({ lemma: '' })).not.toThrow();
  });

  it('edge case 2: multi-word lemma — must not throw', () => {
    expect(() => stub.check({ lemma: 'hello world' })).not.toThrow();
  });
});
