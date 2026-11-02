import type { Context } from '@opentelemetry/api';
import type {
  ReadableSpan,
  Span,
  SpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { isSensitiveKey, REDACTED_VALUE } from './redaction';

export class SanitizingSpanProcessor implements SpanProcessor {
  constructor(private readonly delegate: SpanProcessor) {}

  onStart(span: Span, parentContext: Context): void {
    this.delegate.onStart(span, parentContext);
  }

  onEnd(span: ReadableSpan): void {
    const attrs = span.attributes as Record<string, unknown>;
    for (const key of Object.keys(attrs)) {
      if (isSensitiveKey(key)) {
        attrs[key] = REDACTED_VALUE;
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
