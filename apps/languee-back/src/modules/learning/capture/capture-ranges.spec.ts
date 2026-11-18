import {
  capturedText,
  maskCapturedRanges,
  rangesCoverCompleteWords,
  rangesReconstructText,
} from './capture-ranges';

describe('capture ranges', () => {
  it('validates code-point ranges before applying NFC and case normalization', () => {
    const context = '😀 e\u0301 turn it off';
    const ranges = [
      { start: 2, end: 4 },
      { start: 5, end: 9 },
      { start: 13, end: 16 },
    ];

    expect(rangesReconstructText(context, 'É TURN OFF', ranges)).toBe(true);
    expect(capturedText(context, ranges)).toBe('e\u0301 turn off');
    expect(maskCapturedRanges(context, ranges)).toBe('😀 ____ ____ it ____');
  });

  it('accepts letters next to digits as separate selectable tokens', () => {
    expect(
      rangesCoverCompleteWords('turn2off', [
        { start: 0, end: 4 },
        { start: 5, end: 8 },
      ]),
    ).toBe(true);
  });

  it.each([
    ['turn,off', [{ start: 0, end: 8 }]],
    ['turn2off', [{ start: 0, end: 8 }]],
    ['turn_off', [{ start: 0, end: 8 }]],
    [
      'turn off',
      [
        { start: 0, end: 4 },
        { start: 3, end: 7 },
      ],
    ],
  ])(
    'rejects punctuation, mixed tokens, and overlaps in %s',
    (context, ranges) => {
      expect(rangesCoverCompleteWords(context, ranges)).toBe(false);
    },
  );

  it('masks only captured components and leaves intervening text intact', () => {
    const context = 'She gave the old machine up, then gave up.';
    const ranges = [
      { start: 4, end: 8 },
      { start: 25, end: 27 },
    ];

    expect(maskCapturedRanges(context, ranges)).toBe(
      'She ____ the old machine ____, then gave up.',
    );
    expect(capturedText(context, ranges)).toBe('gave up');
  });
});
