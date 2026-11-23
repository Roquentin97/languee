import { AsyncLocalStorage } from 'async_hooks';
import { randomUUID } from 'crypto';

export interface RequestContext {
  requestId: string;
  traceId?: string;
  parentSpanId?: string;
  traceFlags?: string;
}

export const requestContextStorage = new AsyncLocalStorage<RequestContext>();

const TRACEPARENT_PATTERN =
  /^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})(?:-([0-9a-f-]+))?$/i;

export function resolveRequestId(
  header: string | string[] | undefined,
): string {
  const candidate = Array.isArray(header) ? header[0] : header;
  return candidate ?? randomUUID();
}

export function parseTraceparent(
  header: string | string[] | undefined,
): Pick<RequestContext, 'traceId' | 'parentSpanId' | 'traceFlags'> {
  const candidate = Array.isArray(header) ? header[0] : header;
  if (candidate === undefined) return {};

  const match = TRACEPARENT_PATTERN.exec(candidate);
  if (!match) return {};

  const [, version, traceId, parentSpanId, traceFlags] = match;
  if (
    version === undefined ||
    version.toLowerCase() === 'ff' ||
    traceId === undefined ||
    /^0+$/.test(traceId) ||
    parentSpanId === undefined ||
    /^0+$/.test(parentSpanId) ||
    traceFlags === undefined
  ) {
    return {};
  }

  if (version === '00' && match[5] !== undefined) return {};
  return {
    traceId: traceId.toLowerCase(),
    parentSpanId: parentSpanId.toLowerCase(),
    traceFlags: traceFlags.toLowerCase(),
  };
}
