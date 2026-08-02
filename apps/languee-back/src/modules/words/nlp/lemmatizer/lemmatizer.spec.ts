import { Lemmatizer } from './lemmatizer';
import { IrregularTableMechanism } from './irregular-table.mechanism';
import { RuleEngineMechanism } from './rule-engine.mechanism';
import { PassthroughMechanism } from './passthrough.mechanism';
import { PreLemmatizedOutput } from '../../interfaces/nlp.interfaces';

describe('Lemmatizer', () => {
  let lemmatizer: Lemmatizer;
  let irregularTable: jest.Mocked<IrregularTableMechanism>;
  let ruleEngine: jest.Mocked<RuleEngineMechanism>;
  let passthrough: jest.Mocked<PassthroughMechanism>;

  beforeEach(() => {
    irregularTable = {
      lookup: jest.fn().mockReturnValue(null),
    };

    ruleEngine = {
      apply: jest.fn().mockReturnValue(null),
    };

    passthrough = {
      resolve: jest.fn().mockImplementation((lemma: string) => lemma),
    };

    lemmatizer = new Lemmatizer(irregularTable, ruleEngine, passthrough);
  });

  // Happy path tests
  describe('happy path — passthrough wins (all mechanisms return null)', () => {
    it('returns "despite" unchanged', () => {
      const input: PreLemmatizedOutput = {
        lemma: 'despite',
        shortCircuited: false,
      };
      const result = lemmatizer.lemmatize(input);
      expect(result).toEqual({ lemma: 'despite' });
    });

    it('returns "although" unchanged', () => {
      const input: PreLemmatizedOutput = {
        lemma: 'although',
        shortCircuited: false,
      };
      const result = lemmatizer.lemmatize(input);
      expect(result).toEqual({ lemma: 'although' });
    });

    it('returns "already" unchanged', () => {
      const input: PreLemmatizedOutput = {
        lemma: 'already',
        shortCircuited: false,
      };
      const result = lemmatizer.lemmatize(input);
      expect(result).toEqual({ lemma: 'already' });
    });
  });

  // EC1: empty string
  it('EC1: returns empty string when input lemma is empty string', () => {
    const input: PreLemmatizedOutput = { lemma: '', shortCircuited: false };
    const result = lemmatizer.lemmatize(input);
    expect(result).toEqual({ lemma: '' });
  });

  // EC2: whitespace-only input
  it('EC2: returns whitespace-only lemma unchanged', () => {
    const input: PreLemmatizedOutput = { lemma: '   ', shortCircuited: false };
    const result = lemmatizer.lemmatize(input);
    expect(result).toEqual({ lemma: '   ' });
  });

  // EC3: Unicode input
  it('EC3: returns Unicode lemma unchanged', () => {
    const inputs = ['éléphant', '日本語', 'über'];
    for (const lemma of inputs) {
      const input: PreLemmatizedOutput = { lemma, shortCircuited: false };
      const result = lemmatizer.lemmatize(input);
      expect(result).toEqual({ lemma });
    }
  });

  // EC4: IrregularTable returns non-null — RuleEngine and Passthrough must NOT be called
  it('EC4: short-circuits after IrregularTable match — RuleEngine and Passthrough not called', () => {
    irregularTable.lookup.mockReturnValue('ran');
    const input: PreLemmatizedOutput = { lemma: 'run', shortCircuited: false };
    const result = lemmatizer.lemmatize(input);
    expect(result).toEqual({ lemma: 'ran' });
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(irregularTable.lookup).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(ruleEngine.apply).not.toHaveBeenCalled();
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(passthrough.resolve).not.toHaveBeenCalled();
  });

  // EC5: RuleEngine returns non-null — Passthrough must NOT be called, IrregularTable must have been called
  it('EC5: short-circuits after RuleEngine match — Passthrough not called, IrregularTable was called', () => {
    irregularTable.lookup.mockReturnValue(null);
    ruleEngine.apply.mockReturnValue('walk');
    const input: PreLemmatizedOutput = {
      lemma: 'walking',
      shortCircuited: false,
    };
    const result = lemmatizer.lemmatize(input);
    expect(result).toEqual({ lemma: 'walk' });
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(irregularTable.lookup).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(ruleEngine.apply).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(passthrough.resolve).not.toHaveBeenCalled();
  });

  // EC6: All three called in order when both IrregularTable and RuleEngine return null
  it('EC6: calls all three mechanisms in order when IrregularTable and RuleEngine return null', () => {
    const callOrder: string[] = [];
    irregularTable.lookup.mockImplementation(() => {
      callOrder.push('irregularTable');
      return null;
    });
    ruleEngine.apply.mockImplementation(() => {
      callOrder.push('ruleEngine');
      return null;
    });
    passthrough.resolve.mockImplementation((lemma: string) => {
      callOrder.push('passthrough');
      return lemma;
    });

    const input: PreLemmatizedOutput = {
      lemma: 'despite',
      shortCircuited: false,
    };
    lemmatizer.lemmatize(input);

    expect(callOrder).toEqual(['irregularTable', 'ruleEngine', 'passthrough']);
  });

  // EC7: Input PreLemmatizedOutput must not be mutated
  it('EC7: does not mutate the input PreLemmatizedOutput', () => {
    const input: PreLemmatizedOutput = Object.freeze({
      lemma: 'running',
      shortCircuited: false,
    });
    // Should not throw when input is frozen
    expect(() => lemmatizer.lemmatize(input)).not.toThrow();
    // Reference check: input is unchanged
    expect(input.lemma).toBe('running');
    expect(input.shortCircuited).toBe(false);
  });

  // EC8: shortCircuited: true — Lemmatizer ignores it, runs full hierarchy
  it('EC8: runs full hierarchy regardless of shortCircuited: true on input', () => {
    const input: PreLemmatizedOutput = {
      lemma: 'despite',
      shortCircuited: true,
    };
    const result = lemmatizer.lemmatize(input);
    expect(result).toEqual({ lemma: 'despite' });
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(irregularTable.lookup).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(ruleEngine.apply).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(passthrough.resolve).toHaveBeenCalledTimes(1);
  });
});
