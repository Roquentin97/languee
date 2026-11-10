import { Injectable, Logger } from '@nestjs/common';
import { SpanStatusCode, trace } from '@opentelemetry/api';
import { MS_PER_SECOND } from '../time/time.constants';
import { AppLogger } from '../logger/app-logger';

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
      throw this.fail(failure, options.target, true);
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
      headers:
        body === undefined
          ? options.headers
          : { ...options.headers, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => undefined);
      throw new RequestFailure(
        'http',
        `${options.target} responded with HTTP ${response.status}`,
        response.status,
        text,
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
   * timeout is raised as a RequestFailure carrying the discriminator, the
   * status, and the response body when there is one.
   */
  async send(url: string, options: RequestOptions): Promise<Response> {
    const timeoutMs = options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(url, {
        headers: options.headers,
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
      );
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      // Read the body before discarding it — a 4xx usually explains itself here.
      const body = await response.text().catch(() => undefined);
      throw this.fail(
        new RequestFailure(
          'http',
          `${options.target} responded with HTTP ${response.status}`,
          response.status,
          body,
        ),
        options.target,
      );
    }

    return response;
  }

  private fail(
    failure: RequestFailure,
    target: string,
    safe = false,
  ): RequestFailure {
    const span = trace.getActiveSpan();
    if (!safe && failure.cause instanceof Error)
      span?.recordException(failure.cause);
    span?.addEvent('http.request_failed', {
      target,
      kind: failure.kind,
      ...(failure.status !== undefined
        ? { 'http.status_code': failure.status }
        : {}),
    });
    span?.setStatus({ code: SpanStatusCode.ERROR, message: failure.message });

    this.logger.warn({
      message: 'outbound request failed',
      event: 'http.request_failed',
      method: this.send.name,
      data: {
        target,
        kind: failure.kind,
        status: failure.status ?? null,
        body: safe ? null : (failure.body?.slice(0, 500) ?? null),
        cause:
          !safe && failure.cause instanceof Error
            ? failure.cause.message
            : null,
      },
    });

    return failure;
  }
}
