import type { NextFunction, Request, Response } from 'express';
import { requestContextStorage } from './request-context';
import { RequestContextMiddleware } from './request-context.middleware';

function makeReq(headers: Record<string, string> = {}): Request {
  return { headers } as unknown as Request;
}

function makeRes(): { res: Response; setHeader: jest.Mock } {
  const setHeader = jest.fn();
  return { res: { setHeader } as unknown as Response, setHeader };
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
      const id = setHeader.mock.calls[0][1] as string;
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
    const id1 = sh1.mock.calls[0]?.[1] as string;

    const { res: res2, setHeader: sh2 } = makeRes();
    middleware.use(makeReq(), res2, () => {});
    const id2 = sh2.mock.calls[0]?.[1] as string;

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
});
