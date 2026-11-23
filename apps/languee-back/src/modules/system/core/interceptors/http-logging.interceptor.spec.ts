import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import type { Request, Response } from 'express';
import { of, throwError } from 'rxjs';
import { requestContextStorage } from '../context/request-context';
import { lookupRequestDetails } from '../../../learning/vocabulary/request-log-policy';
import { REQUEST_LOG_POLICY } from './http-request-log';
import { HttpLoggingInterceptor } from './http-logging.interceptor';
import type { HttpLogLocals } from './http-request-log';

function httpContext(
  request: Request,
  response: Response<unknown, HttpLogLocals>,
): ExecutionContext {
  const handler = () => {};
  Reflect.defineMetadata(REQUEST_LOG_POLICY, lookupRequestDetails, handler);
  return {
    getHandler: () => handler,
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;
}

function makeRequest(): Request {
  return {
    method: 'POST',
    path: '/api/v1/vocabulary/lookup',
    baseUrl: '/api/v1/vocabulary',
    route: { path: '/lookup' },
    headers: { 'content-type': 'application/json' },
    query: {},
    body: {
      text: 'running',
      language: 'en',
      context: 'She is running outside.',
      selectionRanges: [{ start: 7, end: 14 }],
      includeSuggestions: true,
      disablePosFiltering: false,
      password: 'must-not-be-logged',
    },
  } as Request;
}

function makeResponse(): Response<unknown, HttpLogLocals> {
  return { statusCode: 200, locals: {} } as Response<unknown, HttpLogLocals>;
}

describe('HttpLoggingInterceptor', () => {
  const originalLookupLogging = process.env['LOG_LOOKUP_DETAILS'];

  afterEach(() => {
    if (originalLookupLogging === undefined)
      delete process.env['LOG_LOOKUP_DETAILS'];
    else process.env['LOG_LOOKUP_DETAILS'] = originalLookupLogging;
    jest.restoreAllMocks();
  });

  it('logs completed request metadata without lookup content', () => {
    process.env['LOG_LOOKUP_DETAILS'] = 'failed-only';
    const stdout = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    const interceptor = new HttpLoggingInterceptor();
    interceptor
      .intercept(httpContext(makeRequest(), makeResponse()), {
        handle: () => of({ ok: true }),
      } as CallHandler)
      .subscribe();

    const line = stdout.mock.calls[0]?.[0] as string;
    const entry = JSON.parse(line) as Record<string, unknown>;
    expect(entry).toEqual(
      expect.objectContaining({
        event: 'http.request.completed',
        'http.method': 'POST',
        'http.route': '/api/v1/vocabulary/lookup',
        'http.status_code': 200,
      }),
    );
    expect(line).not.toContain('running');
    expect(line).not.toContain('She is running outside.');
    expect(line).not.toContain('must-not-be-logged');
  });

  it.each([
    ['allowed', true, true],
    ['failed-only', false, true],
    ['disabled', false, false],
    ['unexpected', false, false],
  ])(
    'applies %s content policy for successes and failures',
    (mode, successContent, failureContent) => {
      process.env['LOG_LOOKUP_DETAILS'] = mode;
      const stdout = jest
        .spyOn(process.stdout, 'write')
        .mockImplementation(() => true);
      const interceptor = new HttpLoggingInterceptor();
      interceptor
        .intercept(httpContext(makeRequest(), makeResponse()), {
          handle: () => of({ ok: true }),
        } as CallHandler)
        .subscribe();
      interceptor
        .intercept(httpContext(makeRequest(), makeResponse()), {
          handle: () => throwError(() => new NotFoundException()),
        } as CallHandler)
        .subscribe({ error: () => {} });
      expect(
        String(stdout.mock.calls[0]?.[0]).includes('She is running outside.'),
      ).toBe(successContent);
      expect(
        String(stdout.mock.calls[1]?.[0]).includes('She is running outside.'),
      ).toBe(failureContent);
    },
  );

  it('logs an application 404 code and allowlisted lookup details when enabled', (done) => {
    process.env['LOG_LOOKUP_DETAILS'] = 'failed-only';
    const stdout = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    const interceptor = new HttpLoggingInterceptor();
    requestContextStorage.run({ requestId: 'app-404-request' }, () => {
      interceptor
        .intercept(httpContext(makeRequest(), makeResponse()), {
          handle: () =>
            throwError(() => new NotFoundException('DEFINITIONS_NOT_FOUND')),
        } as CallHandler)
        .subscribe({
          error: () => {
            const line = stdout.mock.calls[0]?.[0] as string;
            const entry = JSON.parse(line) as Record<string, unknown>;
            expect(entry).toEqual(
              expect.objectContaining({
                event: 'http.request.failed',
                'http.status_code': 404,
                failure_stage: 'application',
                'error.code': 'DEFINITIONS_NOT_FOUND',
                requestId: 'app-404-request',
              }),
            );
            expect(entry['request_body']).toEqual({
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
            expect(line).not.toContain('must-not-be-logged');
            done();
          },
        });
    });
  });

  it('omits arbitrary exception messages from failure records', (done) => {
    process.env['LOG_LOOKUP_DETAILS'] = 'disabled';
    const stdout = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    const interceptor = new HttpLoggingInterceptor();
    interceptor
      .intercept(httpContext(makeRequest(), makeResponse()), {
        handle: () =>
          throwError(
            () => new BadRequestException('email private@example.test'),
          ),
      } as CallHandler)
      .subscribe({
        error: () => {
          const line = stdout.mock.calls[0]?.[0] as string;
          expect(line).not.toContain('private@example.test');
          done();
        },
      });
  });

  it('logs an untyped error as a 500 even before Express updates its status', (done) => {
    const stdout = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    const response = makeResponse();
    const interceptor = new HttpLoggingInterceptor();

    interceptor
      .intercept(httpContext(makeRequest(), response), {
        handle: () => throwError(() => new Error('private failure detail')),
      } as CallHandler)
      .subscribe({
        error: () => {
          expect(stdout).toHaveBeenCalledTimes(1);
          const entry = JSON.parse(
            stdout.mock.calls[0]?.[0] as string,
          ) as Record<string, unknown>;
          expect(entry).toEqual(
            expect.objectContaining({
              event: 'http.request.failed',
              'http.status_code': 500,
              failure_stage: 'application',
              'error.type': 'Error',
            }),
          );
          expect(entry).not.toHaveProperty('error.message');
          expect(response.locals.httpFailureLogged).toBe(true);
          done();
        },
      });
  });
});
