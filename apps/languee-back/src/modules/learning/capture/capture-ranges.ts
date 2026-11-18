export type CaptureRange = { start: number; end: number };

export const MAX_SELECTION_RANGES = 6;

const WORD_CHAR = /^[\p{L}\p{M}]$/u;

export function rangesCoverCompleteWords(
  context: string | undefined,
  ranges: unknown,
): ranges is CaptureRange[] {
  if (!context || !Array.isArray(ranges)) return false;
  if (ranges.length === 0 || ranges.length > MAX_SELECTION_RANGES) return false;

  const codePoints = Array.from(context);
  let previousEnd = 0;
  for (const range of ranges) {
    if (!isCaptureRange(range)) return false;
    if (
      range.start < previousEnd ||
      range.start >= range.end ||
      range.end > codePoints.length
    )
      return false;

    const selected = codePoints.slice(range.start, range.end);
    if (
      selected.length === 0 ||
      selected.some((character) => !WORD_CHAR.test(character)) ||
      !WORD_CHAR.test(selected[0]) ||
      !WORD_CHAR.test(selected[selected.length - 1]) ||
      (range.start > 0 && WORD_CHAR.test(codePoints[range.start - 1])) ||
      (range.end < codePoints.length && WORD_CHAR.test(codePoints[range.end]))
    )
      return false;

    previousEnd = range.end;
  }
  return true;
}

export function rangesReconstructText(
  context: string | undefined,
  text: string,
  ranges: unknown,
): ranges is CaptureRange[] {
  if (!rangesCoverCompleteWords(context, ranges)) return false;
  const codePoints = Array.from(context ?? '');
  const selectedText = ranges
    .map(({ start, end }) => codePoints.slice(start, end).join(''))
    .join(' ');
  return normalizeSelectionText(selectedText) === normalizeSelectionText(text);
}

export function parseCaptureRanges(value: unknown): CaptureRange[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const ranges: CaptureRange[] = [];
  for (const item of value) {
    if (!isCaptureRange(item)) return null;
    ranges.push({ start: item.start, end: item.end });
  }
  return ranges;
}

export function capturedText(
  context: string | null | undefined,
  ranges: unknown,
): string | null {
  const parsed = parseCaptureRanges(ranges);
  if (!context || !parsed || !rangesCoverCompleteWords(context, parsed))
    return null;
  const codePoints = Array.from(context);
  return parsed
    .map(({ start, end }) => codePoints.slice(start, end).join(''))
    .join(' ');
}

export function maskCapturedRanges(
  context: string | null | undefined,
  ranges: unknown,
): string | null {
  const parsed = parseCaptureRanges(ranges);
  if (!context || !parsed || !rangesCoverCompleteWords(context, parsed))
    return null;

  const codePoints = Array.from(context);
  const result: string[] = [];
  let copiedThrough = 0;
  for (const { start, end } of parsed) {
    result.push(...codePoints.slice(copiedThrough, start), '____');
    copiedThrough = end;
  }
  result.push(...codePoints.slice(copiedThrough));
  return result.join('');
}

function isCaptureRange(value: unknown): value is CaptureRange {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const range = value as Record<string, unknown>;
  return (
    typeof range.start === 'number' &&
    Number.isSafeInteger(range.start) &&
    typeof range.end === 'number' &&
    Number.isSafeInteger(range.end)
  );
}

function normalizeSelectionText(value: string): string {
  return value.normalize('NFC').toLocaleLowerCase('en-US');
}
