const LOG_DENY_LIST = new Set([
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
]);

export function sanitizeLogPayload(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (!LOG_DENY_LIST.has(key.toLowerCase())) {
      result[key] = value;
    }
  }
  return result;
}
