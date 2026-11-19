import { REDACTED_VALUE } from './redaction';
import { sanitizeLogPayload } from './log-sanitizer';

describe('sanitizeLogPayload', () => {
  it('redacts sensitive fields recursively, including exception details', () => {
    const result = sanitizeLogPayload({
      request: { headers: { Authorization: 'Bearer top-secret' } },
      error: {
        message: 'password=hunter2',
        cause: { cookie: 'session=private' },
      },
      request_body: { text: 'safe lookup text' },
    });

    expect(result['request']).toEqual({
      headers: { Authorization: REDACTED_VALUE },
    });
    expect(result['error']).toEqual({
      message: 'password=[REDACTED]',
      cause: { cookie: REDACTED_VALUE },
    });
    expect(result['request_body']).toEqual({ text: 'safe lookup text' });
  });

  it('strips queries from URL fields and bounds arbitrary strings', () => {
    const result = sanitizeLogPayload({
      request_url: 'https://example.test/lookup?word=private#fragment',
      detail: 'x'.repeat(5000),
    });

    expect(result['request_url']).toBe('https://example.test/lookup');
    expect(result['detail']).toBe(`${'x'.repeat(4096 - 14)}...[TRUNCATED]`);
  });

  it('bounds arrays and nesting depth with explicit truncation markers', () => {
    const deep: Record<string, unknown> = {};
    let current = deep;
    for (let index = 0; index < 12; index++) {
      const child: Record<string, unknown> = {};
      current[`level_${index}`] = child;
      current = child;
    }
    current['value'] = 'end';
    const result = sanitizeLogPayload({
      values: Array.from({ length: 66 }, (_, index) => index),
      deep,
    });

    expect((result['values'] as unknown[]).at(-1)).toBe('...[TRUNCATED]');
    expect(JSON.stringify(result['deep'])).toContain('...[TRUNCATED]');
    expect(JSON.stringify(result['deep'])).not.toContain('end');
  });
});
