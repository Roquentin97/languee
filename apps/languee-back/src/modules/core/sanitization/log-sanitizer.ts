import { isSensitiveKey, REDACTED_VALUE } from './redaction';

export function sanitizeLogPayload(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    result[key] = isSensitiveKey(key) ? REDACTED_VALUE : value;
  }
  return result;
}
