import { GapFillStub } from './gap-fill.stub';
import { Definition } from '../interfaces/pipeline.interfaces';

describe('GapFillStub', () => {
  let stub: GapFillStub;

  beforeEach(() => {
    stub = new GapFillStub();
  });

  const sampleDefs: Definition[] = [
    { term: 'run', definition: 'To move fast.', examples: ['She runs every day.'] },
  ];

  it('should return definitions untouched and empty gap_fill_metadata (happy path)', () => {
    const result = stub.fill(sampleDefs);
    expect(result.definitions).toBe(sampleDefs);
    expect(result.gap_fill_metadata).toEqual({});
  });

  it('edge case 8: definitions must be returned untouched (same reference)', () => {
    const result = stub.fill(sampleDefs);
    expect(result.definitions).toBe(sampleDefs);
  });

  it('edge case 8: gap_fill_metadata must be an empty object', () => {
    const result = stub.fill(sampleDefs);
    expect(result.gap_fill_metadata).toEqual({});
    expect(Object.keys(result.gap_fill_metadata)).toHaveLength(0);
  });

  it('edge case 1: empty definitions array — must not throw', () => {
    expect(() => stub.fill([])).not.toThrow();
  });

  it('empty definitions array — returns empty definitions and empty metadata', () => {
    const result = stub.fill([]);
    expect(result.definitions).toEqual([]);
    expect(result.gap_fill_metadata).toEqual({});
  });
});
