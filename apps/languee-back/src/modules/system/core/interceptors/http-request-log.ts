import { HttpException } from '@nestjs/common';
import type { Request } from 'express';

const LOOKUP_ROUTE = '/api/v1/vocabulary/lookup';
const DICTIONARY_LOOKUP_ROUTE = '/api/v1/dictionary/lookup';
const SAVED_MATCHES_ROUTE = '/api/v1/vocabulary/saved-matches';
const USER_DEFINITION_ROUTE = '/api/v1/vocabulary/definitions';
const MAX_LOOKUP_TEXT_BYTES = 1024;
const MAX_CONTEXT_BYTES = 1024;
const SAFE_ERROR_CODE = /^[A-Z][A-Z0-9_]{0,95}$/;

type JsonRecord = Record<string, unknown>;

export interface HttpErrorDetails {
  status: number;
  type: string;
  code?: string;
}

export interface HttpLogLocals {
  httpFailureLogged?: boolean;
}

export function requestPath(request: Request): string {
  return request.path.split(/[?#]/, 1)[0] ?? '/';
}

export function requestRoute(request: Request): string | undefined {
  const routeInfo: unknown = request.route;
  if (!isRecord(routeInfo)) return undefined;
  const path = routeInfo['path'];
  if (typeof path !== 'string') return undefined;
  const prefix = request.baseUrl.replace(/\/$/, '');
  const routeTemplate = `${prefix}/${path}`.replace(/\/{2,}/g, '/');
  return routeTemplate.startsWith('/') ? routeTemplate : `/${routeTemplate}`;
}

export function isLookupRequest(request: Request): boolean {
  return request.method === 'POST' && requestPath(request) === LOOKUP_ROUTE;
}

export function safeRequestDetails(
  request: Request,
  includeLookupContent: boolean,
): JsonRecord {
  const path = requestPath(request);
  const query = stringQuery(request.query);

  if (isLookupRequest(request))
    return lookupRequestDetails(request, includeLookupContent);

  if (request.method === 'GET' && path === DICTIONARY_LOOKUP_ROUTE) {
    return dictionaryLookupDetails(query, includeLookupContent);
  }

  if (request.method === 'POST' && path === SAVED_MATCHES_ROUTE) {
    return savedMatchesDetails(jsonBody(request));
  }

  if (request.method === 'POST' && path === USER_DEFINITION_ROUTE) {
    return userDefinitionDetails(jsonBody(request));
  }

  return { query_parameters: safeNonContentQuery(path, query) };
}

function lookupRequestDetails(
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
      selection_ranges: ranges.length,
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
  ranges: Array<{ start: number; end: number }>,
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
  if (ranges.length > 0) captured['selectionRanges'] = ranges;
  details['request_body'] = captured;
  details['request_body_truncated'] =
    boundedText.truncated || boundedContext.truncated;
}

function dictionaryLookupDetails(
  query: JsonRecord,
  includeContent: boolean,
): JsonRecord {
  const word = stringField(query, 'word');
  const boundedWord = boundUtf8(word, MAX_LOOKUP_TEXT_BYTES);
  return {
    query_parameters: {
      language: safeLanguage(query['language']),
      word_bytes: byteLength(word),
      ...(includeContent && word !== undefined
        ? { word: boundedWord.value, word_truncated: boundedWord.truncated }
        : {}),
    },
    query_content_capture_enabled: includeContent,
  };
}

function savedMatchesDetails(body: JsonRecord): JsonRecord {
  return {
    request_body_metadata: {
      language: safeLanguage(body['language']),
      text_bytes: byteLength(body['text']),
      token_count: Array.isArray(body['tokens']) ? body['tokens'].length : 0,
    },
  };
}

function userDefinitionDetails(body: JsonRecord): JsonRecord {
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

export function httpErrorDetails(
  error: unknown,
  fallbackStatus: number,
): HttpErrorDetails {
  if (!(error instanceof HttpException)) {
    return {
      status: validStatus(fallbackStatus) ? fallbackStatus : 500,
      type: error instanceof Error ? error.name : 'UnknownError',
    };
  }

  const response = error.getResponse();
  const candidates =
    typeof response === 'string'
      ? [response]
      : isRecord(response)
        ? [response['code'], response['error'], response['message']]
        : [];
  const code = candidates
    .map((candidate) =>
      safeCode(Array.isArray(candidate) ? candidate[0] : candidate),
    )
    .find((candidate) => candidate !== undefined);
  return {
    status: error.getStatus(),
    type: error.name,
    ...(code === undefined ? {} : { code }),
  };
}

function safeNonContentQuery(path: string, query: JsonRecord): JsonRecord {
  if (path === '/api/v1/reviews/queue') {
    const limit = query['limit'];
    return {
      has_deck_filter: typeof query['deckId'] === 'string',
      ...(typeof limit === 'string' && /^\d{1,3}$/.test(limit)
        ? { limit: Number(limit) }
        : {}),
    };
  }

  if (path === '/api/v1/cards') {
    const status = query['ankiDroidExportStatus'];
    const failureReason = safeCode(query['failureReason']);
    return {
      has_deck_filter: typeof query['deckId'] === 'string',
      ...(typeof status === 'string' &&
      ['none', 'pending', 'completed', 'failed'].includes(status)
        ? { anki_droid_export_status: status }
        : {}),
      ...(failureReason === undefined ? {} : { failure_reason: failureReason }),
    };
  }

  return {};
}

function jsonBody(request: Request): JsonRecord {
  return jsonContentType(request) && isRecord(request.body) ? request.body : {};
}

function jsonContentType(request: Request): boolean {
  return /^application\/(?:[a-z0-9.+-]+\+)?json(?:\s*;|$)/i.test(
    request.headers['content-type'] ?? '',
  );
}

function stringQuery(value: unknown): JsonRecord {
  if (!isRecord(value)) return {};
  const result: JsonRecord = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === 'string') result[key] = item;
  }
  return result;
}

function stringField(record: JsonRecord, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' ? value : undefined;
}

function booleanField(record: JsonRecord, key: string): boolean | undefined {
  const value = record[key];
  return typeof value === 'boolean' ? value : undefined;
}

function safeLanguage(value: unknown): string | undefined {
  return typeof value === 'string' && /^[a-z]{2}$/.test(value)
    ? value
    : undefined;
}

function safeCode(value: unknown): string | undefined {
  return typeof value === 'string' && SAFE_ERROR_CODE.test(value)
    ? value
    : undefined;
}

function safeSelectionRanges(
  value: unknown,
): Array<{ start: number; end: number }> {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 6).flatMap((range: unknown) => {
    if (!isRecord(range)) return [];
    const start = range['start'];
    const end = range['end'];
    return Number.isSafeInteger(start) && Number.isSafeInteger(end)
      ? [{ start: start as number, end: end as number }]
      : [];
  });
}

function boundUtf8(value: string | undefined, maxBytes: number) {
  if (value === undefined) return { value: undefined, truncated: false };
  let bytes = 0;
  let bounded = '';
  for (const character of value) {
    const characterBytes = Buffer.byteLength(character, 'utf8');
    if (bytes + characterBytes > maxBytes)
      return { value: bounded, truncated: true };
    bytes += characterBytes;
    bounded += character;
  }
  return { value: bounded, truncated: false };
}

function byteLength(value: unknown): number | undefined {
  return typeof value === 'string'
    ? Buffer.byteLength(value, 'utf8')
    : undefined;
}

function validStatus(status: number): boolean {
  return Number.isInteger(status) && status >= 100 && status <= 599;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
