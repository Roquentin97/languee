import type { Context, Span } from '@opentelemetry/api';
import type { ReadableSpan, SpanProcessor } from '@opentelemetry/sdk-trace-base';

const DENY_LIST_PATTERNS = [
  'authorization',
  'password',
  'pass',
  'token',
  'accesstoken',
  'refreshtoken',
  'jwt',
  'cookie',
  'set-cookie',
  'secret',
  'apikey',
  'x-api-key',
];

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  return DENY_LIST_PATTERNS.some(
    (denied) => lower === denied || lower.includes(denied),
  );
}

export class SanitizingSpanProcessor implements SpanProcessor {
  constructor(private readonly delegate: SpanProcessor) {}

  onStart(span: Span, parentContext: Context): void {
    this.delegate.onStart(span, parentContext);
  }

  onEnd(span: ReadableSpan): void {
    const attrs = span.attributes as Record<string, unknown>;
    for (const key of Object.keys(attrs)) {
      if (isSensitiveKey(key)) {
        Reflect.deleteProperty(attrs, key);
      }
    }
    this.delegate.onEnd(span);
  }

  forceFlush(): Promise<void> {
    return this.delegate.forceFlush();
  }

  shutdown(): Promise<void> {
    return this.delegate.shutdown();
  }
}
