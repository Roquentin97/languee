import {
  stripWiktionaryHtml,
  parseWiktionaryResponse,
} from './wiktionary.parser';
import { PartOfSpeech } from '../../vocabulary/enums/part-of-speech.enum';

describe('stripWiktionaryHtml', () => {
  it('removes wiki-link anchor tags, keeping the link text', () => {
    expect(
      stripWiktionaryHtml(
        'To <a rel="mw:WikiLink" href="/wiki/collide" title="collide">collide</a> with.',
      ),
    ).toBe('To collide with.');
  });

  it('removes label spans entirely (including their content-less markup)', () => {
    expect(
      stripWiktionaryHtml(
        '<span class="usage-label-sense" about="#mwt4"></span> To enter.',
      ),
    ).toBe('To enter.');
  });

  it('removes bold tags, keeping inner text', () => {
    expect(
      stripWiktionaryHtml(
        'He lost control of the vehicle and <b>ran into</b> a tree.',
      ),
    ).toBe('He lost control of the vehicle and ran into a tree.');
  });

  it('decodes common HTML entities', () => {
    expect(stripWiktionaryHtml('Rock &amp; roll &lt;loud&gt;')).toBe(
      'Rock & roll <loud>',
    );
    expect(stripWiktionaryHtml('&quot;quoted&quot; &#39;single&#39;')).toBe(
      '"quoted" \'single\'',
    );
    expect(stripWiktionaryHtml('a&nbsp;b')).toBe('a b');
  });

  it('collapses whitespace runs and trims', () => {
    expect(stripWiktionaryHtml('  a   <i></i>  b  ')).toBe('a b');
  });

  it('returns an empty string for markup-only content (label-only definition)', () => {
    expect(stripWiktionaryHtml('<span class="usage-label-sense"></span>')).toBe(
      '',
    );
  });
});

describe('parseWiktionaryResponse', () => {
  function buildFixture() {
    return {
      en: [
        {
          partOfSpeech: 'Verb',
          language: 'English',
          definitions: [
            {
              definition:
                '<span class="usage-label-sense"></span> To <a rel="mw:WikiLink" href="/wiki/collide" title="collide">collide</a> with.',
              parsedExamples: [
                {
                  example:
                    'He lost control of the vehicle and <b>ran into</b> a tree.',
                },
                { example: 'A second, unused example.' },
              ],
              examples: [
                'He lost control of the vehicle and <b>ran into</b> a tree.',
              ],
            },
            {
              // label-only definition, must be filtered after stripping
              definition: '<span class="usage-label-sense"></span>',
            },
            {
              // no examples at all
              definition: 'To <b>flow</b> into a body of water &amp; settle.',
            },
          ],
        },
        {
          // unknown POS, whole usage must be skipped
          partOfSpeech: 'Numeral',
          language: 'English',
          definitions: [{ definition: 'should never appear' }],
        },
        {
          partOfSpeech: 'Idiom',
          language: 'English',
          definitions: [
            {
              definition: 'To reveal a secret.',
              examples: ['Stop trying to <b>spill the beans</b>.'],
            },
          ],
        },
      ],
      other: [
        {
          partOfSpeech: 'Verb',
          language: 'Some other language',
          definitions: [{ definition: 'should not appear in "en" results' }],
        },
      ],
    };
  }

  it('parses a realistic multi-word-entry fixture into clean RawDefinitionEntry[]', () => {
    const result = parseWiktionaryResponse(buildFixture(), 'en');

    expect(result).toEqual([
      {
        partOfSpeech: PartOfSpeech.VERB,
        definition: 'To collide with.',
        example: 'He lost control of the vehicle and ran into a tree.',
      },
      {
        partOfSpeech: PartOfSpeech.VERB,
        definition: 'To flow into a body of water & settle.',
      },
      {
        partOfSpeech: PartOfSpeech.PHRASE,
        definition: 'To reveal a secret.',
        example: 'Stop trying to spill the beans.',
      },
    ]);
  });

  it('picks the example from parsedExamples over the plain examples array', () => {
    const [firstEntry] = parseWiktionaryResponse(buildFixture(), 'en');
    expect(firstEntry.example).toBe(
      'He lost control of the vehicle and ran into a tree.',
    );
  });

  it('filters out definitions that are empty after stripping HTML', () => {
    const result = parseWiktionaryResponse(buildFixture(), 'en');
    expect(result.some((entry) => entry.definition === '')).toBe(false);
  });

  it('skips usages with an unrecognised part of speech', () => {
    const result = parseWiktionaryResponse(buildFixture(), 'en');
    expect(
      result.some((entry) => entry.definition === 'should never appear'),
    ).toBe(false);
  });

  it('maps Idiom to PartOfSpeech.PHRASE', () => {
    const result = parseWiktionaryResponse(buildFixture(), 'en');
    const phraseEntry = result.find(
      (entry) => entry.partOfSpeech === PartOfSpeech.PHRASE,
    );
    expect(phraseEntry).toBeDefined();
  });

  it('omits the example field when no example is present', () => {
    const result = parseWiktionaryResponse(buildFixture(), 'en');
    const noExampleEntry = result.find(
      (entry) => entry.definition === 'To flow into a body of water & settle.',
    );
    expect(noExampleEntry).not.toHaveProperty('example');
  });

  it('returns [] when the language key is missing from the body', () => {
    expect(parseWiktionaryResponse(buildFixture(), 'fr')).toEqual([]);
  });

  it('returns [] when the body is not an object', () => {
    expect(parseWiktionaryResponse(null, 'en')).toEqual([]);
    expect(parseWiktionaryResponse('not an object', 'en')).toEqual([]);
    expect(parseWiktionaryResponse(undefined, 'en')).toEqual([]);
  });

  it('returns [] when the language value is not an array', () => {
    expect(parseWiktionaryResponse({ en: 'not an array' }, 'en')).toEqual([]);
  });

  it('skips a usage whose definitions field is not an array', () => {
    const result = parseWiktionaryResponse(
      { en: [{ partOfSpeech: 'Verb', definitions: 'nope' }] },
      'en',
    );
    expect(result).toEqual([]);
  });

  it('skips individual malformed definition entries without throwing', () => {
    const result = parseWiktionaryResponse(
      {
        en: [
          {
            partOfSpeech: 'Verb',
            definitions: [
              null,
              42,
              { definition: 123 },
              { noDefinitionKey: true },
            ],
          },
        ],
      },
      'en',
    );
    expect(result).toEqual([]);
  });

  it('maps case-insensitively (lowercase "verb" still resolves)', () => {
    const result = parseWiktionaryResponse(
      {
        en: [
          { partOfSpeech: 'verb', definitions: [{ definition: 'move fast' }] },
        ],
      },
      'en',
    );
    expect(result[0].partOfSpeech).toBe(PartOfSpeech.VERB);
  });
});
