import type { Context } from '@opentelemetry/api';
import type {
  ReadableSpan,
  Span,
  SpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { SanitizingSpanProcessor } from './sanitize-span.processor';

function makeReadableSpan(
  attributes: Record<string, unknown>,
): ReadableSpan {
  return { attributes } as unknown as ReadableSpan;
}

function makeDelegate(): SpanProcessor {
  return {
    onStart: jest.fn(),
    onEnd: jest.fn(),
    forceFlush: jest.fn().mockResolvedValue(undefined),
    shutdown: jest.fn().mockResolvedValue(undefined),
  };
}

describe('SanitizingSpanProcessor', () => {
  it('passes non-sensitive attributes through to the delegate', () => {
    const delegate = makeDelegate();
    const processor = new SanitizingSpanProcessor(delegate);
    const span = makeReadableSpan({ 'http.method': 'GET', 'http.status_code': 200 });

    processor.onEnd(span);

    expect(span.attributes).toEqual({ 'http.method': 'GET', 'http.status_code': 200 });
    expect(delegate.onEnd).toHaveBeenCalledWith(span);
  });

  it('strips http.request.header.authorization', () => {
    const delegate = makeDelegate();
    const processor = new SanitizingSpanProcessor(delegate);
    const span = makeReadableSpan({
      'http.method': 'GET',
      'http.request.header.authorization': 'Basic abc123',
    });

    processor.onEnd(span);

    expect(span.attributes).not.toHaveProperty('http.request.header.authorization');
    expect(span.attributes['http.method']).toBe('GET');
  });

  it('strips all deny-list keys regardless of case', () => {
    const delegate = makeDelegate();
    const processor = new SanitizingSpanProcessor(delegate);
    const span = makeReadableSpan({
      Authorization: 'Bearer token',
      PASSWORD: 'secret123',
      'x-api-key': 'key',
      cookie: 'session=abc',
      'set-cookie': 'session=abc; Path=/',
      jwt: 'eyJhbGc',
      secret: 'shh',
      apiKey: 'abc',
      token: 'tok',
      accessToken: 'at',
      refreshToken: 'rt',
      pass: 'word',
    });

    processor.onEnd(span);

    expect(Object.keys(span.attributes as object)).toHaveLength(0);
  });

  it('strips keys that contain deny-list terms in a larger key name', () => {
    const delegate = makeDelegate();
    const processor = new SanitizingSpanProcessor(delegate);
    const span = makeReadableSpan({
      'db.user.password': 'secret',
      'request.accessToken': 'tok',
      'safe.key': 'keep-me',
    });

    processor.onEnd(span);

    expect(span.attributes).not.toHaveProperty('db.user.password');
    expect(span.attributes).not.toHaveProperty('request.accessToken');
    expect(span.attributes['safe.key']).toBe('keep-me');
  });

  it('delegates onStart to the wrapped processor', () => {
    const delegate = makeDelegate();
    const processor = new SanitizingSpanProcessor(delegate);
    const span = {} as Span;
    const ctx = {} as Context;

    processor.onStart(span, ctx);

    expect(delegate.onStart).toHaveBeenCalledWith(span, ctx);
  });

  it('delegates forceFlush to the wrapped processor', async () => {
    const delegate = makeDelegate();
    const processor = new SanitizingSpanProcessor(delegate);

    await processor.forceFlush();

    expect(delegate.forceFlush).toHaveBeenCalled();
  });

  it('delegates shutdown to the wrapped processor', async () => {
    const delegate = makeDelegate();
    const processor = new SanitizingSpanProcessor(delegate);

    await processor.shutdown();

    expect(delegate.shutdown).toHaveBeenCalled();
  });
});
