import type { Request } from 'express';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  httpErrorDetails,
  requestPath,
  requestRoute,
  safeRequestDetails,
} from './http-request-log';

function makeRequest(overrides: Partial<Request>): Request {
  return {
    method: 'POST',
    path: '/api/v1/vocabulary/lookup',
    baseUrl: '',
    headers: { 'content-type': 'application/json' },
    body: {
      text: 'running',
      language: 'en',
      context: 'She is running outside.',
      selectionRanges: [{ start: 7, end: 14 }],
      includeSuggestions: true,
      disablePosFiltering: false,
      password: 'never-allow-this-field',
    },
    query: {},
    ...overrides,
  } as Request;
}

describe('HTTP request logging helpers', () => {
  it('summarizes lookup input without capturing user content by default', () => {
    const details = safeRequestDetails(makeRequest({}), false);

    expect(details['request_body_capture_enabled']).toBe(false);
    expect(details['request_summary']).toEqual({
      language: 'en',
      language_was_omitted: false,
      text_bytes: 7,
      has_context: true,
      context_bytes: 23,
      selection_ranges: 1,
      selection_ranges_truncated: false,
      include_suggestions: true,
      disable_pos_filtering: false,
    });
    expect(details).not.toHaveProperty('request_body');
    expect(JSON.stringify(details)).not.toContain('running');
    expect(JSON.stringify(details)).not.toContain('never-allow-this-field');
  });

  it('captures only the lookup field allowlist when explicitly enabled', () => {
    const details = safeRequestDetails(makeRequest({}), true);

    expect(details['request_body']).toEqual({
      text: 'running',
      language: 'en',
      context: 'She is running outside.',
      selectionRanges: [{ start: 7, end: 14 }],
      includeSuggestions: true,
      includeSuggestions_was_omitted: false,
      disablePosFiltering: false,
      disablePosFiltering_was_omitted: false,
      language_was_omitted: false,
    });
    expect(JSON.stringify(details)).not.toContain('never-allow-this-field');
    expect(details['request_body_truncated']).toBe(false);
  });

  it('records effective lookup defaults when optional fields were omitted', () => {
    const details = safeRequestDetails(
      makeRequest({ body: { text: 'running' } }),
      true,
    )['request_body'] as Record<string, unknown>;

    expect(details).toEqual({
      text: 'running',
      language: 'en',
      language_was_omitted: true,
      includeSuggestions: true,
      includeSuggestions_was_omitted: true,
      disablePosFiltering: false,
      disablePosFiltering_was_omitted: true,
    });
  });

  it('marks bounded body content as truncated and ignores non-JSON streams', () => {
    const longRequest = makeRequest({
      body: { text: 'é'.repeat(600), language: 'en' },
    });
    const details = safeRequestDetails(longRequest, true);
    expect(details['request_body_truncated']).toBe(true);
    expect(
      Buffer.byteLength((details['request_body'] as { text: string }).text),
    ).toBe(1024);

    const streamRequest = makeRequest({
      headers: { 'content-type': 'text/plain' },
      body: { text: 'must not be inspected' },
    });
    const streamDetails = safeRequestDetails(streamRequest, true);
    expect(streamDetails['request_body_capture_status']).toBe(
      'unsupported_content_type',
    );
    expect(streamDetails).not.toHaveProperty('request_body');
  });

  it('marks oversized and malformed selection ranges as truncated', () => {
    const validRange = { start: 0, end: 1 };
    const oversized = safeRequestDetails(
      makeRequest({
        body: { text: 'running', selectionRanges: Array(7).fill(validRange) },
      }),
      true,
    );
    expect(oversized['request_summary']).toEqual(
      expect.objectContaining({
        selection_ranges: 6,
        selection_ranges_truncated: true,
      }),
    );
    expect(oversized['request_body_truncated']).toBe(true);
    expect(
      (oversized['request_body'] as Record<string, unknown>)['selectionRanges'],
    ).toHaveLength(6);

    const malformed = safeRequestDetails(
      makeRequest({
        body: {
          text: 'running',
          selectionRanges: [validRange, { start: 'invalid', end: 2 }],
        },
      }),
      true,
    );
    expect(malformed['request_summary']).toEqual(
      expect.objectContaining({
        selection_ranges: 1,
        selection_ranges_truncated: true,
      }),
    );
    expect(malformed['request_body_truncated']).toBe(true);

    const rejected = safeRequestDetails(
      makeRequest({
        body: { text: 'running', selectionRanges: { start: 0, end: 1 } },
      }),
      true,
    );
    expect(rejected['request_summary']).toEqual(
      expect.objectContaining({
        selection_ranges: 0,
        selection_ranges_truncated: true,
      }),
    );
    expect(rejected['request_body_truncated']).toBe(true);
  });

  it('captures dictionary query text only with the explicit content flag', () => {
    const request = makeRequest({
      method: 'GET',
      path: '/api/v1/dictionary/lookup',
      query: { word: 'running', language: 'en', token: 'secret' },
    });

    const redacted = safeRequestDetails(request, false);
    expect(redacted['query_parameters']).toEqual({
      language: 'en',
      word_bytes: 7,
    });
    expect(JSON.stringify(redacted)).not.toContain('running');
    expect(JSON.stringify(redacted)).not.toContain('secret');

    const captured = safeRequestDetails(request, true);
    expect(captured['query_parameters']).toEqual({
      language: 'en',
      word_bytes: 7,
      word: 'running',
      word_truncated: false,
    });
  });

  it('uses the route template when available and a query-free path otherwise', () => {
    expect(
      requestRoute(
        makeRequest({
          baseUrl: '/api/v1/vocabulary',
          route: { path: '/lookup' } as Request['route'],
        }),
      ),
    ).toBe('/api/v1/vocabulary/lookup');
    expect(requestPath(makeRequest({ path: '/missing?token=secret' }))).toBe(
      '/missing',
    );
  });

  it('extracts safe application error codes without logging arbitrary messages', () => {
    expect(
      httpErrorDetails(new NotFoundException('DEFINITIONS_NOT_FOUND'), 200),
    ).toEqual({
      status: 404,
      type: 'NotFoundException',
      code: 'DEFINITIONS_NOT_FOUND',
    });
    expect(
      httpErrorDetails(
        new BadRequestException('email private@example.test'),
        200,
      ),
    ).toEqual({
      status: 400,
      type: 'BadRequestException',
    });
    expect(httpErrorDetails(new Error('private input'), 500)).toEqual({
      status: 500,
      type: 'Error',
    });
  });
});
