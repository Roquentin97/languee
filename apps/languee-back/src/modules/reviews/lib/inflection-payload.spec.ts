import { checkTypedForms, formKeysFor } from './inflection-payload';

describe('formKeysFor()', () => {
  it('happy path — lists only the populated forms, in declaration order', () => {
    expect(
      formKeysFor({
        type: 'verb',
        base: 'run',
        past: 'ran',
        present3sg: 'runs',
      }),
    ).toEqual(['base', 'past', 'present3sg']);
  });

  it('edge case — unset forms are excluded', () => {
    expect(formKeysFor({ type: 'verb', base: 'must' })).toEqual(['base']);
  });
});

describe('checkTypedForms()', () => {
  const paradigm = {
    type: 'verb' as const,
    base: 'run',
    past: 'ran',
    present3sg: 'runs',
  };

  it('happy path — marks a matching form correct regardless of case/whitespace', () => {
    const result = checkTypedForms(paradigm, {
      base: '  Run ',
      past: 'ran',
      present3sg: 'runs',
    });

    expect(result.base).toEqual({
      typed: '  Run ',
      expected: 'run',
      correct: true,
    });
    expect(result.past.correct).toBe(true);
    expect(result.present3sg.correct).toBe(true);
  });

  it('edge case — a missing typed form is treated as an incorrect empty answer', () => {
    const result = checkTypedForms(paradigm, { base: 'run' });

    expect(result.past).toEqual({ typed: '', expected: 'ran', correct: false });
  });
});
