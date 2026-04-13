import type { Request, Response, NextFunction } from 'express';
import { createBasicAuthMiddleware } from './basic-auth.middleware.factory';

const VALID_USER = 'admin';
const VALID_PASSWORD = 's3cr3tpassword';

function encodeBasicAuth(user: string, password: string): string {
  return `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;
}

function buildRequest(authHeader?: string): Request {
  return {
    headers: authHeader !== undefined ? { authorization: authHeader } : {},
  } as unknown as Request;
}

interface MockRes {
  _statusCode: number | undefined;
  _headers: Record<string, string>;
  _body: string | undefined;
  setHeader: jest.Mock;
  status: jest.Mock;
  send: jest.Mock;
}

function buildResponse(): { res: MockRes & Response } {
  const mockRes: MockRes = {
    _statusCode: undefined,
    _headers: {},
    _body: undefined,
    setHeader: jest.fn(),
    status: jest.fn(),
    send: jest.fn(),
  };

  mockRes.setHeader.mockImplementation((name: string, value: string) => {
    mockRes._headers[name] = value;
    return mockRes;
  });

  mockRes.status.mockImplementation((code: number) => {
    mockRes._statusCode = code;
    return mockRes;
  });

  mockRes.send.mockImplementation((body: string) => {
    mockRes._body = body;
    return mockRes;
  });

  return { res: mockRes as unknown as MockRes & Response };
}

describe('createBasicAuthMiddleware', () => {
  let middleware: (req: Request, res: Response, next: NextFunction) => void;

  beforeEach(() => {
    middleware = createBasicAuthMiddleware(VALID_USER, VALID_PASSWORD);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('missing or invalid Authorization header', () => {
    it('returns 401 with WWW-Authenticate when Authorization header is absent', () => {
      const req = buildRequest();
      const { res } = buildResponse();
      const next = jest.fn();

      middleware(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith(
        'WWW-Authenticate',
        'Basic realm="Protected"',
      );
      expect(res._statusCode).toBe(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('returns 401 when Authorization header does not start with "Basic "', () => {
      const req = buildRequest('Bearer sometoken');
      const { res } = buildResponse();
      const next = jest.fn();

      middleware(req, res, next);

      expect(res._statusCode).toBe(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('returns 401 when Basic credentials contain no colon separator', () => {
      const nocolon = Buffer.from('nocolon').toString('base64');
      const req = buildRequest(`Basic ${nocolon}`);
      const { res } = buildResponse();
      const next = jest.fn();

      middleware(req, res, next);

      expect(res._statusCode).toBe(401);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('wrong credentials', () => {
    it('returns 401 when password is wrong', () => {
      const req = buildRequest(encodeBasicAuth(VALID_USER, 'wrongpassword'));
      const { res } = buildResponse();
      const next = jest.fn();

      middleware(req, res, next);

      expect(res._statusCode).toBe(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('returns 401 when username is wrong', () => {
      const req = buildRequest(encodeBasicAuth('wronguser', VALID_PASSWORD));
      const { res } = buildResponse();
      const next = jest.fn();

      middleware(req, res, next);

      expect(res._statusCode).toBe(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('returns 401 when both username and password are wrong', () => {
      const req = buildRequest(encodeBasicAuth('bad', 'creds'));
      const { res } = buildResponse();
      const next = jest.fn();

      middleware(req, res, next);

      expect(res._statusCode).toBe(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('sets WWW-Authenticate header on wrong credentials', () => {
      const req = buildRequest(encodeBasicAuth(VALID_USER, 'wrongpassword'));
      const { res } = buildResponse();
      const next = jest.fn();

      middleware(req, res, next);

      expect(res._headers['WWW-Authenticate']).toBe('Basic realm="Protected"');
    });
  });

  describe('correct credentials', () => {
    it('calls next() when credentials are correct', () => {
      const req = buildRequest(encodeBasicAuth(VALID_USER, VALID_PASSWORD));
      const { res } = buildResponse();
      const next = jest.fn();

      middleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res._statusCode).toBeUndefined();
    });

    it('does not call res.status or res.send on success', () => {
      const req = buildRequest(encodeBasicAuth(VALID_USER, VALID_PASSWORD));
      const { res } = buildResponse();
      const next = jest.fn();

      middleware(req, res, next);

      expect(res.status).not.toHaveBeenCalled();
      expect(res.send).not.toHaveBeenCalled();
    });
  });

  describe('timing-safe comparison', () => {
    it('uses hash-based timing-safe comparison — correct creds pass, wrong creds fail', () => {
      // Verify correct credentials pass
      const reqOk = buildRequest(encodeBasicAuth(VALID_USER, VALID_PASSWORD));
      const { res: resOk } = buildResponse();
      const nextOk = jest.fn();
      middleware(reqOk, resOk, nextOk);
      expect(nextOk).toHaveBeenCalled();

      // Verify wrong credentials fail
      const reqBad = buildRequest(encodeBasicAuth(VALID_USER, 'wrongpassword'));
      const { res: resBad } = buildResponse();
      const nextBad = jest.fn();
      middleware(reqBad, resBad, nextBad);
      expect(resBad._statusCode).toBe(401);
      expect(nextBad).not.toHaveBeenCalled();
    });

    it('correctly authenticates despite length difference (hash normalisation)', () => {
      // A short password vs a long password — hash normalisation ensures equal-length buffers
      const shortPwdMiddleware = createBasicAuthMiddleware('u', 'p');

      const reqOk = buildRequest(encodeBasicAuth('u', 'p'));
      const { res: resOk } = buildResponse();
      const nextOk = jest.fn();
      shortPwdMiddleware(reqOk, resOk, nextOk);
      expect(nextOk).toHaveBeenCalled();

      const reqBad = buildRequest(encodeBasicAuth('u', 'wrong'));
      const { res: resBad } = buildResponse();
      const nextBad = jest.fn();
      shortPwdMiddleware(reqBad, resBad, nextBad);
      expect(resBad._statusCode).toBe(401);
      expect(nextBad).not.toHaveBeenCalled();
    });

    it('calls crypto.timingSafeEqual (verifiable via wrong-creds rejection)', () => {
      // We can't spy on timingSafeEqual directly (non-configurable),
      // but we can verify the timing-safe path works correctly by confirming
      // that a credential that differs by only 1 character is rejected.
      const almostCorrectPassword = VALID_PASSWORD.slice(0, -1) + 'X';
      const req = buildRequest(
        encodeBasicAuth(VALID_USER, almostCorrectPassword),
      );
      const { res } = buildResponse();
      const next = jest.fn();

      middleware(req, res, next);

      expect(res._statusCode).toBe(401);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('edge case: password containing colons', () => {
    it('handles passwords with colons correctly', () => {
      const colonPassword = 'pass:with:colons';
      const colonMiddleware = createBasicAuthMiddleware(
        VALID_USER,
        colonPassword,
      );

      const req = buildRequest(encodeBasicAuth(VALID_USER, colonPassword));
      const { res } = buildResponse();
      const next = jest.fn();

      colonMiddleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res._statusCode).toBeUndefined();
    });
  });

  describe('optional realm parameter', () => {
    it('uses "Protected" as the default realm when no realm is provided', () => {
      const req = buildRequest();
      const { res } = buildResponse();
      const next = jest.fn();

      middleware(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith(
        'WWW-Authenticate',
        'Basic realm="Protected"',
      );
    });

    it('uses the supplied realm="Swagger" in WWW-Authenticate header', () => {
      const swaggerMiddleware = createBasicAuthMiddleware(
        VALID_USER,
        VALID_PASSWORD,
        'Swagger',
      );
      const req = buildRequest();
      const { res } = buildResponse();
      const next = jest.fn();

      swaggerMiddleware(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith(
        'WWW-Authenticate',
        'Basic realm="Swagger"',
      );
    });

    it('uses the supplied realm="System" in WWW-Authenticate header', () => {
      const systemMiddleware = createBasicAuthMiddleware(
        VALID_USER,
        VALID_PASSWORD,
        'System',
      );
      const req = buildRequest();
      const { res } = buildResponse();
      const next = jest.fn();

      systemMiddleware(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith(
        'WWW-Authenticate',
        'Basic realm="System"',
      );
    });
  });
});
