import type { Request } from 'express';
import {
  jsonBody,
  jsonContentType,
  stringField,
  booleanField,
  safeLanguage,
  safeCode,
  boundUtf8,
  byteLength,
  isRecord,
  type JsonRecord,
} from '../../system/core/interceptors/http-log-values';

const MAX_LOOKUP_TEXT_BYTES = 1024;
const MAX_CONTEXT_BYTES = 1024;

export function lookupRequestDetails(
  request: Request,
  includeContent: boolean,
): JsonRecord {
  const body = jsonBody(request);
  const text = stringField(body, 'text');
  const context = stringField(body, 'context');
  const ranges = safeSelectionRanges(body['selectionRanges']);
  const language = safeLanguage(body['language']) ?? 'en';
  const includeSuggestions = booleanField(body, 'includeSuggestions') ?? true;
  const disablePosFiltering =
    booleanField(body, 'disablePosFiltering') ?? false;
  const contentTypeIsJson = jsonContentType(request);
  const details: JsonRecord = {
    request_body_capture_enabled: includeContent,
    request_body_capture_status: captureStatus(
      contentTypeIsJson,
      includeContent,
    ),
    request_summary: {
      language,
      language_was_omitted: body['language'] === undefined,
      text_bytes: byteLength(text),
      has_context: context !== undefined,
      context_bytes: byteLength(context),
      selection_ranges: ranges.ranges.length,
      selection_ranges_truncated: ranges.truncated,
      include_suggestions: includeSuggestions,
      disable_pos_filtering: disablePosFiltering,
    },
  };
  if (includeContent && contentTypeIsJson) {
    addCapturedLookupBody(details, body, text, context, ranges);
  }
  return details;
}

function captureStatus(isJson: boolean, includeContent: boolean): string {
  if (!isJson) return 'unsupported_content_type';
  return includeContent ? 'captured' : 'disabled';
}

function addCapturedLookupBody(
  details: JsonRecord,
  body: JsonRecord,
  text: string | undefined,
  context: string | undefined,
  ranges: ReturnType<typeof safeSelectionRanges>,
): void {
  const boundedText = boundUtf8(text, MAX_LOOKUP_TEXT_BYTES);
  const boundedContext = boundUtf8(context, MAX_CONTEXT_BYTES);
  const captured: JsonRecord = {
    language: safeLanguage(body['language']) ?? 'en',
    language_was_omitted: body['language'] === undefined,
    includeSuggestions: booleanField(body, 'includeSuggestions') ?? true,
    includeSuggestions_was_omitted: body['includeSuggestions'] === undefined,
    disablePosFiltering: booleanField(body, 'disablePosFiltering') ?? false,
    disablePosFiltering_was_omitted: body['disablePosFiltering'] === undefined,
  };
  if (boundedText.value !== undefined) captured['text'] = boundedText.value;
  if (boundedContext.value !== undefined)
    captured['context'] = boundedContext.value;
  if (ranges.ranges.length > 0) captured['selectionRanges'] = ranges.ranges;
  details['request_body'] = captured;
  details['request_body_truncated'] =
    boundedText.truncated || boundedContext.truncated || ranges.truncated;
}

export function savedMatchesDetails(request: Request): JsonRecord {
  const body = jsonBody(request);
  return {
    request_body_metadata: {
      language: safeLanguage(body['language']),
      text_bytes: byteLength(body['text']),
      token_count: Array.isArray(body['tokens']) ? body['tokens'].length : 0,
    },
  };
}

export function userDefinitionDetails(request: Request): JsonRecord {
  const body = jsonBody(request);
  return {
    request_body_metadata: {
      language: safeLanguage(body['language']),
      text_bytes: byteLength(body['text']),
      definition_bytes: byteLength(body['definition']),
      example_bytes: byteLength(body['example']),
      has_example: typeof body['example'] === 'string',
      part_of_speech: safeCode(body['partOfSpeech']),
    },
  };
}

function safeSelectionRanges(value: unknown): {
  ranges: Array<{ start: number; end: number }>;
  truncated: boolean;
} {
  if (value === undefined) return { ranges: [], truncated: false };
  if (!Array.isArray(value)) return { ranges: [], truncated: true };

  const truncated = value.length > 6;
  const ranges = value.slice(0, 6).flatMap((range: unknown) => {
    if (!isRecord(range)) return [];
    const start = range['start'];
    const end = range['end'];
    if (Number.isSafeInteger(start) && Number.isSafeInteger(end))
      return [{ start: start as number, end: end as number }];
    return [];
  });
  return {
    ranges,
    truncated: truncated || ranges.length !== Math.min(value.length, 6),
  };
}
