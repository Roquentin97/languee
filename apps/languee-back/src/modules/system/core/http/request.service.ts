import { Injectable, Logger } from '@nestjs/common';
import { SpanStatusCode, trace } from '@opentelemetry/api';
import { MS_PER_SECOND } from '../time/time.constants';
import { AppLogger } from '../logger/app-logger';
import { requestContextStorage } from '../context/request-context';

export const DEFAULT_REQUEST_TIMEOUT_MS = 5 * MS_PER_SECOND;

/**
 * Why an outbound call failed. Kept distinct because they are operationally
 * different: `network` means we never got a response, `http` means the remote
 * answered with an error status, and `parse` means it answered with a body we
 * could not read. Collapsing them loses the only signal that tells "the
 * provider is down" apart from "the provider is slow" or "we sent it garbage".
 */
export type RequestFailureKind = 'network' | 'http' | 'timeout' | 'parse';

export class RequestFailure extends Error {
  constructor(
    readonly kind: RequestFailureKind,
    message: string,
    readonly status?: number,
    /** Response body for a non-ok status; this is where a 4xx explains itself. */
    readonly body?: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'RequestFailure';
  }
}

export interface RequestOptions {
  headers?: Record<string, string>;
  /** Overrides DEFAULT_REQUEST_TIMEOUT_MS for a slow-but-known-slow provider. */
  timeoutMs?: number;
  /** Identifies the remote in logs and spans, e.g. 'wiktionary' or 'nlp'. */
  target: string;
  operation?: string;
}

/**
 * Single outbound-HTTP seam. Adapters and service clients go through this
 * rather than calling `fetch` directly, so that timeouts, error
 * discrimination and cause logging exist in one place instead of being
 * re-implemented (or forgotten) per caller.
 */
@Injectable()
export class RequestService {
  private readonly logger = new Logger(RequestService.name);
  private readonly slowLogger = new AppLogger(RequestService.name);

  async getJson<T>(url: string, options: RequestOptions): Promise<T> {
    if (options.operation) return this.lookupJson<T>(url, options);
    const response = await this.send(url, options);
    try {
      return (await response.json()) as T;
    } catch (err: unknown) {
      throw this.fail(
        new RequestFailure(
          'parse',
          `${options.target} returned a body that is not valid JSON`,
          response.status,
          undefined,
          err,
        ),
        options.target,
      );
    }
  }

  postJson<T>(url: string, body: unknown, options: RequestOptions): Promise<T> {
    return this.lookupJson<T>(url, options, body);
  }

  private async lookupJson<T>(
    url: string,
    options: RequestOptions,
    body?: unknown,
  ): Promise<T> {
    const timeoutMs = options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    const controller = new AbortController();
    const slowTimer = this.startSlowTimer(options, timeoutMs);
    let timeout: ReturnType<typeof setTimeout>;
    const deadline = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        controller.abort();
        reject(
          new RequestFailure(
            'timeout',
            `${options.target} did not respond within ${timeoutMs}ms`,
          ),
        );
      }, timeoutMs);
    });
    try {
      return await Promise.race([
        this.readJson<T>(url, options, controller.signal, body),
        deadline,
      ]);
    } catch (err: unknown) {
      const failure =
        err instanceof RequestFailure
          ? err
          : new RequestFailure(
              'network',
              `${options.target} could not be reached`,
              undefined,
              undefined,
              err,
            );
      throw this.fail(failure, options.target, options.operation);
    } finally {
      clearTimeout(timeout!);
      clearTimeout(slowTimer);
    }
  }

  private startSlowTimer(options: RequestOptions, timeoutMs: number) {
    const started = Date.now();
    const span = trace.getActiveSpan();
    return setTimeout(() => {
      const data = {
        target: options.target,
        operation: options.operation ?? 'request',
        elapsedMs: Date.now() - started,
        thresholdMs: 3000,
        timeoutMs,
        inFlight: true,
      };
      this.slowLogger.warn({
        message: 'outbound request slow',
        event: 'http.request_slow',
        ...data,
      });
      span?.addEvent('http.request_slow', data);
    }, 3000);
  }

  private async readJson<T>(
    url: string,
    options: RequestOptions,
    signal: AbortSignal,
    body?: unknown,
  ): Promise<T> {
    const response = await fetch(url, {
      method: body === undefined ? 'GET' : 'POST',
      headers: this.requestHeaders(options, body !== undefined),
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
    if (!response.ok) {
      throw new RequestFailure(
        'http',
        `${options.target} responded with HTTP ${response.status}`,
        response.status,
      );
    }
    try {
      return (await response.json()) as T;
    } catch (err: unknown) {
      throw new RequestFailure(
        'parse',
        `${options.target} returned a body that is not valid JSON`,
        response.status,
        undefined,
        err,
      );
    }
  }

  /**
   * Returns the raw response for a 2xx. Any non-ok status, network error or
   * timeout is raised as a RequestFailure carrying the failure type and status.
   */
  async send(url: string, options: RequestOptions): Promise<Response> {
    const timeoutMs = options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(url, {
        headers: this.requestHeaders(options, false),
        signal: controller.signal,
      });
    } catch (err: unknown) {
      const aborted = err instanceof Error && err.name === 'AbortError';
      throw this.fail(
        new RequestFailure(
          aborted ? 'timeout' : 'network',
          aborted
            ? `${options.target} did not respond within ${timeoutMs}ms`
            : `${options.target} could not be reached`,
          undefined,
          undefined,
          err,
        ),
        options.target,
        options.operation,
      );
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw this.fail(
        new RequestFailure(
          'http',
          `${options.target} responded with HTTP ${response.status}`,
          response.status,
        ),
        options.target,
        options.operation,
      );
    }

    return response;
  }

  private fail(
    failure: RequestFailure,
    target: string,
    operation?: string,
  ): RequestFailure {
    const span = trace.getActiveSpan();
    span?.addEvent('http.request_failed', {
      target,
      kind: failure.kind,
      ...(failure.status !== undefined
        ? { 'http.status_code': failure.status }
        : {}),
      ...(failure.cause instanceof Error
        ? { 'error.type': failure.cause.name }
        : {}),
    });
    span?.setStatus({ code: SpanStatusCode.ERROR, message: failure.kind });

    this.logger.warn({
      message: 'outbound request failed',
      event: 'http.request_failed',
      method: 'outbound_http',
      data: {
        target,
        ...(operation === undefined ? {} : { operation }),
        kind: failure.kind,
        status: failure.status ?? null,
        ...(failure.cause instanceof Error
          ? { cause_type: failure.cause.name }
          : {}),
      },
    });

    return failure;
  }

  private requestHeaders(
    options: RequestOptions,
    hasJsonBody: boolean,
  ): Record<string, string> | undefined {
    const headers = { ...options.headers };
    if (
      hasJsonBody &&
      !Object.keys(headers).some((key) => key.toLowerCase() === 'content-type')
    ) {
      headers['Content-Type'] = 'application/json';
    }

    const requestId = requestContextStorage.getStore()?.requestId;
    if (
      options.target === 'nlp' &&
      requestId !== undefined &&
      !Object.keys(headers).some((key) => key.toLowerCase() === 'x-request-id')
    ) {
      headers['X-Request-ID'] = requestId;
    }
    if (options.target === 'nlp') {
      for (const key of Object.keys(headers)) {
        if (key.toLowerCase() === 'traceparent') delete headers[key];
      }
      const traceparent = this.traceparentHeader();
      if (traceparent !== undefined) headers.traceparent = traceparent;
    }
    return Object.keys(headers).length > 0 ? headers : undefined;
  }

  private traceparentHeader(): string | undefined {
    const spanContext = trace.getActiveSpan()?.spanContext();
    if (
      spanContext !== undefined &&
      /^[0-9a-f]{32}$/i.test(spanContext.traceId) &&
      /^[0-9a-f]{16}$/i.test(spanContext.spanId) &&
      spanContext.traceId !== '00000000000000000000000000000000' &&
      spanContext.spanId !== '0000000000000000' &&
      Number.isInteger(spanContext.traceFlags) &&
      spanContext.traceFlags >= 0 &&
      spanContext.traceFlags <= 255
    ) {
      const traceId = spanContext.traceId.toLowerCase();
      const spanId = spanContext.spanId.toLowerCase();
      const flags = spanContext.traceFlags.toString(16).padStart(2, '0');
      return `00-${traceId}-${spanId}-${flags}`;
    }

    const context = requestContextStorage.getStore();
    if (
      context?.traceId === undefined ||
      context.parentSpanId === undefined ||
      context.traceFlags === undefined
    ) {
      return undefined;
    }
    return `00-${context.traceId}-${context.parentSpanId}-${context.traceFlags}`;
  }
}
