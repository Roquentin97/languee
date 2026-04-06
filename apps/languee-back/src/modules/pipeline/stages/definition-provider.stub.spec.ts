import { DefinitionProviderStub } from './definition-provider.stub';

describe('DefinitionProviderStub', () => {
  let stub: DefinitionProviderStub;

  beforeEach(() => {
    stub = new DefinitionProviderStub();
  });

  it('should return exactly one definition (happy path)', () => {
    const result = stub.provide({ lemma: 'run' });
    expect(result).toHaveLength(1);
  });

  it('edge case 7: must always return an array with exactly one entry', () => {
    expect(stub.provide({ lemma: '' })).toHaveLength(1);
    expect(stub.provide({ lemma: 'hello world' })).toHaveLength(1);
    expect(stub.provide({ lemma: 'anything' })).toHaveLength(1);
  });

  it('definition entry must have term, definition, and examples fields', () => {
    const result = stub.provide({ lemma: 'test' });
    expect(result[0]).toHaveProperty('term');
    expect(result[0]).toHaveProperty('definition');
    expect(result[0]).toHaveProperty('examples');
  });

  it('edge case 1: empty string lemma — must not throw', () => {
    expect(() => stub.provide({ lemma: '' })).not.toThrow();
  });

  it('edge case 2: multi-word lemma — must not throw', () => {
    expect(() => stub.provide({ lemma: 'hello world' })).not.toThrow();
  });
});
