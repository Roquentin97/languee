import { collectTargetForms, maskText } from './masking';

describe('collectTargetForms()', () => {
  it('happy path — returns just the lemma when there are no inflection forms', () => {
    expect(collectTargetForms('run', null)).toEqual(['run']);
  });

  it('happy path — collects string values from inflection forms, excluding the type key', () => {
    const forms = collectTargetForms('run', {
      type: 'verb',
      base: 'run',
      past: 'ran',
      pastParticiple: 'run',
      gerundParticiple: 'running',
      present3sg: 'runs',
    });

    expect(forms).toEqual(['run', 'ran', 'running', 'runs']);
    expect(forms).not.toContain('verb');
  });

  it('edge case — deduplicates forms case-insensitively, keeping first occurrence casing', () => {
    const forms = collectTargetForms('Run', {
      type: 'verb',
      base: 'run',
    });

    expect(forms).toEqual(['Run']);
  });

  it('edge case — ignores non-string values on the inflection forms object', () => {
    const forms = collectTargetForms('good', {
      type: 'adjective',
      positive: 'good',
      comparative: undefined,
    });

    expect(forms).toEqual(['good']);
  });

  it('edge case — multi-word expression lemma is kept as a single form', () => {
    const forms = collectTargetForms('come across', null);
    expect(forms).toEqual(['come across']);
  });

  it('edge case — empty string values are skipped', () => {
    const forms = collectTargetForms('run', { type: 'verb', past: '' });
    expect(forms).toEqual(['run']);
  });
});

describe('maskText()', () => {
  it('happy path — masks a single-word lemma', () => {
    expect(maskText('She runs every morning.', ['run', 'runs'])).toBe(
      'She ____ every morning.',
    );
  });

  it('happy path — masks an inflected form distinct from the lemma', () => {
    expect(maskText('I ran to the store.', ['run', 'ran'])).toBe(
      'I ____ to the store.',
    );
  });

  it('happy path — masks a multi-word expression, longest form first', () => {
    expect(
      maskText('Guess who I come across at the station!', [
        'come across',
        'come',
      ]),
    ).toBe('Guess who I ____ at the station!');
  });

  it('edge case — returns text unchanged when no form matches', () => {
    expect(maskText('Nothing to see here.', ['run', 'ran'])).toBe(
      'Nothing to see here.',
    );
  });

  it('edge case — null context/example passes through as null', () => {
    expect(maskText(null, ['run'])).toBeNull();
    expect(maskText(undefined, ['run'])).toBeNull();
  });

  it('edge case — only masks standalone occurrences, not substrings', () => {
    expect(maskText('The running club meets daily.', ['run'])).toBe(
      'The running club meets daily.',
    );
  });

  it('edge case — masking is case-insensitive', () => {
    expect(maskText('Run! Run fast.', ['run'])).toBe('____! ____ fast.');
  });

  it('edge case — masks every occurrence of a form', () => {
    expect(maskText('run and run and run', ['run'])).toBe(
      '____ and ____ and ____',
    );
  });

  it('edge case — no forms to mask returns text unchanged', () => {
    expect(maskText('She runs every morning.', [])).toBe(
      'She runs every morning.',
    );
  });

  // ---------------------------------------------------------------------
  // Unicode word boundaries (accented letters, diacritics in loanwords)
  // ---------------------------------------------------------------------

  it('Unicode — masks an accented loanword in context', () => {
    expect(maskText('They serve espresso at the café.', ['café'])).toBe(
      'They serve espresso at the ____.',
    );
  });

  it('Unicode — masks a multi-word accented expression', () => {
    expect(maskText('It felt like déjà vu all over again.', ['déjà vu'])).toBe(
      'It felt like ____ all over again.',
    );
  });

  it('Unicode — does not mask "cafés" as a standalone occurrence of lemma "café" (plural is a different form not in the list)', () => {
    expect(maskText('We visited two cafés.', ['café'])).toBe(
      'We visited two cafés.',
    );
  });

  it('Unicode — masks "cafés" when it is itself a listed form', () => {
    expect(maskText('We visited two cafés.', ['café', 'cafés'])).toBe(
      'We visited two ____.',
    );
  });

  it('Unicode — masks a diacritic form as a standalone occurrence', () => {
    expect(
      maskText('He met his doppelgänger yesterday.', ['doppelgänger']),
    ).toBe('He met his ____ yesterday.');
  });

  it('Unicode — a diacritic form does not mask a longer word merely containing it', () => {
    expect(maskText('She is naïve.', ['naïve'])).toBe('She is ____.');
    expect(maskText('Her naïveté was charming.', ['naïve'])).toBe(
      'Her naïveté was charming.',
    );
  });

  it('English regression — ASCII boundary masking is unchanged after the Unicode fix', () => {
    expect(maskText('She runs every morning.', ['run', 'runs'])).toBe(
      'She ____ every morning.',
    );
    expect(maskText('The running club meets daily.', ['run'])).toBe(
      'The running club meets daily.',
    );
  });
});
