import { CardAssemblerStub } from './card-assembler.stub';

describe('CardAssemblerStub', () => {
  let stub: CardAssemblerStub;

  beforeEach(() => {
    stub = new CardAssemblerStub();
  });

  const input = {
    normalized_form: 'run',
    is_multi_word: false,
    pos: null,
    lemma: 'run',
    definitions: [{ term: 'run', definition: 'To move fast.', examples: [] }],
    gap_fill_metadata: {},
  };

  it('should return a CardOutput with all 8 fields (happy path)', () => {
    const result = stub.assemble(input);
    expect(result).toHaveProperty('id');
    expect(result).toHaveProperty('term');
    expect(result).toHaveProperty('lemma');
    expect(result).toHaveProperty('definition');
    expect(result).toHaveProperty('examples');
    expect(result).toHaveProperty('pos');
    expect(result).toHaveProperty('is_multi_word');
    expect(result).toHaveProperty('gap_fill_metadata');
  });

  it('edge case 9: assemble must return all 8 CardOutput fields', () => {
    const result = stub.assemble(input);
    const keys: Array<keyof typeof result> = [
      'id',
      'term',
      'lemma',
      'definition',
      'examples',
      'pos',
      'is_multi_word',
      'gap_fill_metadata',
    ];
    keys.forEach((key) => expect(result).toHaveProperty(key));
  });

  it('edge case 1: empty normalized_form — must not throw', () => {
    expect(() =>
      stub.assemble({ ...input, normalized_form: '' }),
    ).not.toThrow();
  });

  it('edge case 2: multi-word input — must not throw', () => {
    expect(() =>
      stub.assemble({ ...input, normalized_form: 'hello world', is_multi_word: true }),
    ).not.toThrow();
  });
});
