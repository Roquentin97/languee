import { checkAnswer, normalizeAnswer } from './answer-matching';

describe('normalizeAnswer()', () => {
  it('trims, lowercases, and collapses internal whitespace', () => {
    expect(normalizeAnswer('  Come   Across  ')).toBe('come across');
  });

  it('NFC-normalizes composed vs decomposed accents to the same value', () => {
    const composed = 'étudier'; // é as a single code point
    const decomposed = 'étudier'; // e + combining acute accent
    expect(normalizeAnswer(composed)).toBe(normalizeAnswer(decomposed));
  });
});

describe('checkAnswer()', () => {
  it('happy path — correct via lemma', () => {
    const result = checkAnswer('run', ['run', 'ran'], []);
    expect(result).toEqual({ result: 'correct', matchedForm: 'run' });
  });

  it('happy path — correct via inflection form returns that form as matchedForm', () => {
    const result = checkAnswer('ran', ['run', 'ran'], []);
    expect(result).toEqual({ result: 'correct', matchedForm: 'ran' });
  });

  it('happy path — close_synonym when answer matches a synonym lemma', () => {
    const result = checkAnswer('bump into', ['run into'], ['bump into']);
    expect(result).toEqual({ result: 'close_synonym', matchedForm: null });
  });

  it('happy path — incorrect when nothing matches', () => {
    const result = checkAnswer('walk', ['run', 'ran'], ['bump into']);
    expect(result).toEqual({ result: 'incorrect', matchedForm: null });
  });

  it('edge case — case-insensitive matching', () => {
    const result = checkAnswer('RAN', ['run', 'ran'], []);
    expect(result).toEqual({ result: 'correct', matchedForm: 'ran' });
  });

  it('edge case — whitespace-insensitive matching', () => {
    const result = checkAnswer('  come   across  ', ['come across'], []);
    expect(result).toEqual({ result: 'correct', matchedForm: 'come across' });
  });

  it('edge case — NFC-insensitive matching', () => {
    const decomposedAnswer = 'étudier';
    const result = checkAnswer(decomposedAnswer, ['étudier'], []);
    expect(result).toEqual({
      result: 'correct',
      matchedForm: 'étudier',
    });
  });

  it('edge case — correct takes precedence over a coincidentally matching synonym', () => {
    const result = checkAnswer('run', ['run'], ['run']);
    expect(result).toEqual({ result: 'correct', matchedForm: 'run' });
  });

  // ---------------------------------------------------------------------
  // Spanish accents — case/whitespace-insensitive, but accents are REQUIRED.
  // We deliberately do not strip diacritics: "está" (is, verb estar) and
  // "esta" (this, determiner) are different Spanish words, so accepting
  // "esta" for a card whose target form is "está" would mark a genuinely
  // wrong answer as correct.
  // ---------------------------------------------------------------------

  it('Spanish — "hablo" and "HABLO " (case/whitespace-insensitive) both match target form "hablo"', () => {
    const result = checkAnswer('HABLO ', ['hablo'], []);
    expect(result).toEqual({ result: 'correct', matchedForm: 'hablo' });
  });

  it('Spanish — accents are required: "esta" does not match target form "está"', () => {
    const result = checkAnswer('esta', ['está'], []);
    expect(result).toEqual({ result: 'incorrect', matchedForm: null });
  });

  it('Spanish — "está" matches target form "está" exactly', () => {
    const result = checkAnswer('está', ['está'], []);
    expect(result).toEqual({ result: 'correct', matchedForm: 'está' });
  });
});
