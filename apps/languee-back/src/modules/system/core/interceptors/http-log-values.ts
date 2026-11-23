import type { Request } from 'express';

export type JsonRecord = Record<string, unknown>;
const SAFE_ERROR_CODE = /^[A-Z][A-Z0-9_]{0,95}$/;

export function jsonBody(request: Request): JsonRecord {
  return jsonContentType(request) && isRecord(request.body) ? request.body : {};
}

export function jsonContentType(request: Request): boolean {
  return /^application\/(?:[a-z0-9.+-]+\+)?json(?:\s*;|$)/i.test(
    request.headers['content-type'] ?? '',
  );
}

export function stringQuery(value: unknown): JsonRecord {
  if (!isRecord(value)) return {};
  const result: JsonRecord = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === 'string') result[key] = item;
  }
  return result;
}

export function stringField(
  record: JsonRecord,
  key: string,
): string | undefined {
  const value = record[key];
  return typeof value === 'string' ? value : undefined;
}

export function booleanField(
  record: JsonRecord,
  key: string,
): boolean | undefined {
  const value = record[key];
  return typeof value === 'boolean' ? value : undefined;
}

export function safeLanguage(value: unknown): string | undefined {
  return typeof value === 'string' && /^[a-z]{2}$/.test(value)
    ? value
    : undefined;
}

export function safeCode(value: unknown): string | undefined {
  return typeof value === 'string' && SAFE_ERROR_CODE.test(value)
    ? value
    : undefined;
}

export function boundUtf8(value: string | undefined, maxBytes: number) {
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

export function byteLength(value: unknown): number | undefined {
  return typeof value === 'string'
    ? Buffer.byteLength(value, 'utf8')
    : undefined;
}

export function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
