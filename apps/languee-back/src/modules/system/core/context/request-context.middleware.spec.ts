import type { NextFunction, Request, Response } from 'express';
import {
  parseTraceparent,
  requestContextStorage,
  resolveRequestId,
} from './request-context';
import { RequestContextMiddleware } from './request-context.middleware';

function makeReq(headers: Record<string, string | string[]> = {}): Request {
  return { headers } as unknown as Request;
}

function makeRes(): {
  res: Response;
  setHeader: jest.Mock;
  finish: () => void;
} {
  const setHeader = jest.fn();
  let finishHandler: (() => void) | undefined;
  const res = {
    setHeader,
    statusCode: 200,
    locals: {},
    once: jest.fn((event: string, handler: () => void) => {
      if (event === 'finish') finishHandler = handler;
      return res;
    }),
  } as unknown as Response;
  return { res, setHeader, finish: () => finishHandler?.() };
}

describe('RequestContextMiddleware', () => {
  let middleware: RequestContextMiddleware;

  beforeEach(() => {
    middleware = new RequestContextMiddleware();
  });

  it('generates an X-Request-ID when the inbound header is absent', (done) => {
    const req = makeReq();
    const { res, setHeader } = makeRes();
    const next: NextFunction = () => {
      expect(setHeader).toHaveBeenCalledWith(
        'X-Request-ID',
        expect.any(String),
      );
      const id = (setHeader.mock.calls as [string, string][])[0][1];
      // UUID v4 pattern
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      done();
    };

    middleware.use(req, res, next);
  });

  it('echoes the X-Request-ID header from the inbound request', (done) => {
    const req = makeReq({ 'x-request-id': 'my-request-id' });
    const { res, setHeader } = makeRes();
    const next: NextFunction = () => {
      expect(setHeader).toHaveBeenCalledWith('X-Request-ID', 'my-request-id');
      done();
    };

    middleware.use(req, res, next);
  });

  it('replaces malformed request ids rather than echoing unsafe header values', () => {
    const { res, setHeader } = makeRes();
    middleware.use(
      makeReq({ 'x-request-id': 'bad\nrequest-id' }),
      res,
      () => {},
    );

    const id = (setHeader.mock.calls as [string, string][])[0]?.[1];
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('stores the requestId in AsyncLocalStorage before calling next', (done) => {
    const req = makeReq({ 'x-request-id': 'ctx-test-id' });
    const { res } = makeRes();
    const next: NextFunction = () => {
      const ctx = requestContextStorage.getStore();
      expect(ctx).toBeDefined();
      expect(ctx?.requestId).toBe('ctx-test-id');
      done();
    };

    middleware.use(req, res, next);
  });

  it('generates a unique requestId on each call when no header is present', () => {
    const { res: res1, setHeader: sh1 } = makeRes();
    middleware.use(makeReq(), res1, () => {});
    const id1 = (sh1.mock.calls as [string, string][])[0]?.[1];

    const { res: res2, setHeader: sh2 } = makeRes();
    middleware.use(makeReq(), res2, () => {});
    const id2 = (sh2.mock.calls as [string, string][])[0]?.[1];

    expect(id1).toBeDefined();
    expect(id2).toBeDefined();
    expect(id1).not.toBe(id2);
  });

  it('stores a generated requestId in the ALS context', (done) => {
    const req = makeReq();
    const { res } = makeRes();
    const next: NextFunction = () => {
      const ctx = requestContextStorage.getStore();
      expect(ctx?.requestId).toBeDefined();
      expect(typeof ctx?.requestId).toBe('string');
      done();
    };

    middleware.use(req, res, next);
  });

  it('logs a route-level 404 with a safe path and generated request id', () => {
    const stdout = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    const req = makeReq({
      traceparent: '00-aabbccddeeff00112233445566778899-0011223344556677-01',
    });
    Object.assign(req, {
      method: 'GET',
      path: '/api/v1/missing?token=do-not-log',
      query: {},
    });
    const { res, finish } = makeRes();
    Object.assign(res, { statusCode: 404 });

    let requestContext: ReturnType<typeof requestContextStorage.getStore>;
    const next: NextFunction = () => {
      requestContext = requestContextStorage.getStore();
    };
    middleware.use(req, res, next);
    requestContextStorage.run(requestContext!, finish);

    const line = stdout.mock.calls[0]?.[0] as string;
    const event = JSON.parse(line) as Record<string, unknown>;
    expect(event['event']).toBe('http.request.failed');
    expect(event['failure_stage']).toBe('route');
    expect(event['error.code']).toBe('ROUTE_NOT_FOUND');
    expect(event['url.path']).toBe('/api/v1/missing');
    expect(event['requestId']).toMatch(/^[0-9a-f-]{36}$/);
    expect(event['trace_id']).toBe('aabbccddeeff00112233445566778899');
    expect(line).not.toContain('do-not-log');
    stdout.mockRestore();
  });
});

describe('request header validation', () => {
  it('accepts bounded ids and creates a UUID for malformed or oversized values', () => {
    expect(resolveRequestId('safe-id.123')).toBe('safe-id.123');
    expect(resolveRequestId('bad id')).toMatch(/^[0-9a-f-]{36}$/);
    expect(resolveRequestId('x'.repeat(129))).toMatch(/^[0-9a-f-]{36}$/);
    expect(resolveRequestId(['first', 'second'])).toBe('first');
  });

  it('extracts valid W3C trace ids and ignores missing or malformed headers', () => {
    expect(
      parseTraceparent(
        '00-aabbccddeeff00112233445566778899-0011223344556677-01',
      ),
    ).toEqual({
      traceId: 'aabbccddeeff00112233445566778899',
      parentSpanId: '0011223344556677',
      traceFlags: '01',
    });
    expect(parseTraceparent(undefined)).toEqual({});
    expect(parseTraceparent('not-a-traceparent')).toEqual({});
    expect(
      parseTraceparent(
        'ff-aabbccddeeff00112233445566778899-0011223344556677-01',
      ),
    ).toEqual({});
    expect(
      parseTraceparent(
        '00-00000000000000000000000000000000-0011223344556677-01',
      ),
    ).toEqual({});
  });
});
