import { isSensitiveKey, REDACTED_VALUE } from './redaction';

const MAX_STRING_LENGTH = 4096;
const MAX_COLLECTION_ITEMS = 64;
const MAX_NESTING_DEPTH = 8;
const TRUNCATION_MARKER = '...[TRUNCATED]';

export function sanitizeLogPayload(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  return sanitizeRecord(payload, 0);
}

function sanitizeRecord(
  value: Record<string, unknown>,
  depth: number,
): Record<string, unknown> {
  const entries = Object.entries(value).slice(0, MAX_COLLECTION_ITEMS);
  const result: Record<string, unknown> = {};

  for (const [key, entry] of entries) {
    result[key] = isSensitiveKey(key)
      ? REDACTED_VALUE
      : sanitizeValue(entry, depth + 1, key);
  }

  if (Object.keys(value).length > MAX_COLLECTION_ITEMS) {
    result['log_fields_truncated'] = true;
  }
  return result;
}

function sanitizeValue(value: unknown, depth: number, key: string): unknown {
  if (typeof value === 'string') return sanitizeString(value, key);
  if (value === null || typeof value === 'number' || typeof value === 'boolean')
    return value;
  if (depth >= MAX_NESTING_DEPTH) return TRUNCATION_MARKER;
  if (Array.isArray(value)) return sanitizeArray(value, depth, key);
  if (isRecord(value)) return sanitizeRecord(value, depth);
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'symbol') return value.toString();
  return '[Unsupported log value]';
}

function sanitizeArray(
  value: unknown[],
  depth: number,
  key: string,
): unknown[] {
  const result = value
    .slice(0, MAX_COLLECTION_ITEMS)
    .map((entry) => sanitizeValue(entry, depth + 1, key));
  if (value.length > MAX_COLLECTION_ITEMS) result.push(TRUNCATION_MARKER);
  return result;
}

function sanitizeString(value: string, key: string): string {
  let safe = value
    .replace(
      /\b(authorization|proxy-authorization|cookie|set-cookie|password|pass|token|access[_-]?token|refresh[_-]?token|secret|api[_-]?key)\s*([=:])\s*((?:Bearer|Basic)\s+[A-Za-z0-9._~+/-]+=*|"[^"]*"|'[^']*'|[^\s,;&]+)/gi,
      '$1$2[REDACTED]',
    )
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/-]+=*/gi, '$1 [REDACTED]');

  if (/(^|[._-])(url|uri)([._-]|$)/i.test(key)) safe = stripUrlQuery(safe);
  return safe.length > MAX_STRING_LENGTH
    ? `${safe.slice(0, MAX_STRING_LENGTH - TRUNCATION_MARKER.length)}${TRUNCATION_MARKER}`
    : safe;
}

function stripUrlQuery(value: string): string {
  try {
    const url = new URL(value);
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return value.split(/[?#]/, 1)[0] ?? value;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
