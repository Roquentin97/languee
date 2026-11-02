export const REDACTED_VALUE = '[REDACTED]';

const SENSITIVE_KEY_PATTERNS = [
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
] as const;

export function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SENSITIVE_KEY_PATTERNS.some(
    (pattern) => lower === pattern || lower.includes(pattern),
  );
}
