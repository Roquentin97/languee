import { checkAnswer, normalizeAnswer } from './answer-matching';

describe('normalizeAnswer()', () => {
  it('trims, lowercases, and collapses internal whitespace', () => {
    expect(normalizeAnswer('  Come   Across  ')).toBe('come across');
  });

  it('NFC-normalizes composed vs decomposed accents to the same value', () => {
    const composed = 'étudier'; // é as a single code point
    const decomposed = 'étudier'; // e + combining acute accent
    expect(normalizeAnswer(composed)).toBe(normalizeAnswer(decomposed));
  });
});

describe('checkAnswer()', () => {
  it('happy path — correct via lemma', () => {
    const result = checkAnswer('run', ['run', 'ran']);
    expect(result).toEqual({ result: 'correct', matchedForm: 'run' });
  });

  it('happy path — correct via inflection form returns that form as matchedForm', () => {
    const result = checkAnswer('ran', ['run', 'ran']);
    expect(result).toEqual({ result: 'correct', matchedForm: 'ran' });
  });

  it('happy path — incorrect when nothing matches', () => {
    const result = checkAnswer('walk', ['run', 'ran']);
    expect(result).toEqual({ result: 'incorrect', matchedForm: null });
  });

  it('edge case — case-insensitive matching', () => {
    const result = checkAnswer('RAN', ['run', 'ran']);
    expect(result).toEqual({ result: 'correct', matchedForm: 'ran' });
  });

  it('edge case — whitespace-insensitive matching', () => {
    const result = checkAnswer('  come   across  ', ['come across']);
    expect(result).toEqual({ result: 'correct', matchedForm: 'come across' });
  });

  it('edge case — NFC-insensitive matching', () => {
    const decomposedAnswer = 'étudier';
    const result = checkAnswer(decomposedAnswer, ['étudier']);
    expect(result).toEqual({
      result: 'correct',
      matchedForm: 'étudier',
    });
  });

  it('edge case — empty target forms yields incorrect', () => {
    const result = checkAnswer('run', []);
    expect(result).toEqual({ result: 'incorrect', matchedForm: null });
  });

  // ---------------------------------------------------------------------
  // Accents — case/whitespace-insensitive, but accents are REQUIRED.
  // We deliberately do not strip diacritics: "résumé" and "resume" are
  // different words, so accepting a diacritic-stripped answer for a card
  // whose target form carries accents would mark a genuinely wrong answer
  // as correct.
  // ---------------------------------------------------------------------

  it('accents — "café" and "CAFÉ " (case/whitespace-insensitive) both match target form "café"', () => {
    const result = checkAnswer('CAFÉ ', ['café']);
    expect(result).toEqual({ result: 'correct', matchedForm: 'café' });
  });

  it('accents — accents are required: "cafe" does not match target form "café"', () => {
    const result = checkAnswer('cafe', ['café']);
    expect(result).toEqual({ result: 'incorrect', matchedForm: null });
  });

  it('accents — "café" matches target form "café" exactly', () => {
    const result = checkAnswer('café', ['café']);
    expect(result).toEqual({ result: 'correct', matchedForm: 'café' });
  });
});
