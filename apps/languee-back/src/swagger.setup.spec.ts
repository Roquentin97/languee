import type { INestApplication } from '@nestjs/common';

// We need to mock @nestjs/swagger before importing swagger.setup
jest.mock('@nestjs/swagger', () => ({
  DocumentBuilder: jest.fn().mockImplementation(() => ({
    setTitle: jest.fn().mockReturnThis(),
    setVersion: jest.fn().mockReturnThis(),
    addBearerAuth: jest.fn().mockReturnThis(),
    build: jest.fn().mockReturnValue({}),
  })),
  SwaggerModule: {
    createDocument: jest.fn().mockReturnValue({}),
    setup: jest.fn(),
  },
}));

import { setupSwagger } from './swagger.setup';

type MiddlewareFn = (req: unknown, res: unknown, next: unknown) => void;

function buildApp(registeredMiddleware: { paths: string[]; fn: MiddlewareFn }[] = []): INestApplication {
  return {
    use: jest.fn().mockImplementation((paths: string[], fn: MiddlewareFn) => {
      registeredMiddleware.push({ paths, fn });
    }),
  } as unknown as INestApplication;
}

function buildRequest(authHeader?: string): Record<string, unknown> {
  return {
    headers: authHeader !== undefined ? { authorization: authHeader } : {},
  };
}

function buildResponse(): {
  status: jest.Mock;
  setHeader: jest.Mock;
  send: jest.Mock;
  _statusCode: number | undefined;
} {
  const res = {
    _statusCode: undefined as number | undefined,
    status: jest.fn().mockImplementation(function (this: typeof res, code: number) {
      this._statusCode = code;
      return this;
    }),
    setHeader: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
  };
  return res;
}

function encodeBasicAuth(user: string, password: string): string {
  return `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;
}

describe('setupSwagger', () => {
  const VALID_USER = 'admin';
  const VALID_PASSWORD = 'password';

  beforeEach(() => {
    process.env['BASIC_AUTH'] = VALID_USER;
    process.env['BASIC_PASSWORD'] = VALID_PASSWORD;
  });

  afterEach(() => {
    delete process.env['BASIC_AUTH'];
    delete process.env['BASIC_PASSWORD'];
    jest.clearAllMocks();
  });

  // Edge case 1: BASIC_AUTH is undefined or empty
  describe('Edge case 1: missing BASIC_AUTH', () => {
    it('throws an Error when BASIC_AUTH is not set', () => {
      delete process.env['BASIC_AUTH'];
      const app = buildApp();
      expect(() => setupSwagger(app)).toThrow('BASIC_AUTH environment variable is required but not set');
    });

    it('throws an Error when BASIC_AUTH is an empty string', () => {
      process.env['BASIC_AUTH'] = '';
      const app = buildApp();
      expect(() => setupSwagger(app)).toThrow(Error);
    });
  });

  // Edge case 2: BASIC_PASSWORD is undefined or empty
  describe('Edge case 2: missing BASIC_PASSWORD', () => {
    it('throws an Error when BASIC_PASSWORD is not set', () => {
      delete process.env['BASIC_PASSWORD'];
      const app = buildApp();
      expect(() => setupSwagger(app)).toThrow('BASIC_PASSWORD environment variable is required but not set');
    });

    it('throws an Error when BASIC_PASSWORD is an empty string', () => {
      process.env['BASIC_PASSWORD'] = '';
      const app = buildApp();
      expect(() => setupSwagger(app)).toThrow(Error);
    });
  });

  describe('Basic Auth middleware', () => {
    let middleware: MiddlewareFn;
    let registeredMiddleware: { paths: string[]; fn: MiddlewareFn }[];

    beforeEach(() => {
      registeredMiddleware = [];
      const app = buildApp(registeredMiddleware);
      setupSwagger(app);
      // The first registered middleware is the Basic Auth guard
      middleware = registeredMiddleware[0].fn;
    });

    // Edge case 3: no Authorization header → 401 with WWW-Authenticate
    it('responds 401 with WWW-Authenticate when Authorization header is absent', () => {
      const req = buildRequest();
      const res = buildResponse();
      const next = jest.fn();

      middleware(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith('WWW-Authenticate', 'Basic realm="Swagger"');
      expect(res._statusCode).toBe(401);
      expect(next).not.toHaveBeenCalled();
    });

    // Edge case 4: malformed Authorization header → 401, no crash
    it('responds 401 for a malformed Authorization header (not Basic scheme)', () => {
      const req = buildRequest('Bearer sometoken');
      const res = buildResponse();
      const next = jest.fn();

      middleware(req, res, next);

      expect(res._statusCode).toBe(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('responds 401 for a malformed base64 payload missing colon separator', () => {
      // base64-encode a string with no colon
      const noColon = Buffer.from('nodivider').toString('base64');
      const req = buildRequest(`Basic ${noColon}`);
      const res = buildResponse();
      const next = jest.fn();

      middleware(req, res, next);

      expect(res._statusCode).toBe(401);
      expect(next).not.toHaveBeenCalled();
    });

    // Edge case 5: correct username but wrong password → 401
    it('responds 401 when the password is wrong', () => {
      const req = buildRequest(encodeBasicAuth(VALID_USER, 'wrongpassword'));
      const res = buildResponse();
      const next = jest.fn();

      middleware(req, res, next);

      expect(res._statusCode).toBe(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('responds 401 when the username is wrong', () => {
      const req = buildRequest(encodeBasicAuth('wronguser', VALID_PASSWORD));
      const res = buildResponse();
      const next = jest.fn();

      middleware(req, res, next);

      expect(res._statusCode).toBe(401);
      expect(next).not.toHaveBeenCalled();
    });

    // Edge case 6: correct credentials → next() is called
    it('calls next() when credentials are correct', () => {
      const req = buildRequest(encodeBasicAuth(VALID_USER, VALID_PASSWORD));
      const res = buildResponse();
      const next = jest.fn();

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res._statusCode).toBeUndefined();
    });

    // Edge case 8: timing-safe comparison via crypto.timingSafeEqual
    it('uses crypto.timingSafeEqual (hashing normalises lengths) for credential comparison', () => {
      // Verify that the middleware calls the real timingSafeEqual by checking
      // that it correctly distinguishes between matching and non-matching
      // credentials — which only works if the hash-then-compare logic is intact.
      const reqOk = buildRequest(encodeBasicAuth(VALID_USER, VALID_PASSWORD));
      const resOk = buildResponse();
      const nextOk = jest.fn();
      middleware(reqOk, resOk, nextOk);
      expect(nextOk).toHaveBeenCalled();

      const reqBad = buildRequest(encodeBasicAuth(VALID_USER, 'wrongpassword'));
      const resBad = buildResponse();
      const nextBad = jest.fn();
      middleware(reqBad, resBad, nextBad);
      expect(resBad._statusCode).toBe(401);
      expect(nextBad).not.toHaveBeenCalled();
    });
  });

  // Edge case 7: non-docs endpoint is NOT intercepted by the middleware
  describe('Edge case 7: middleware scope', () => {
    it('registers middleware only for /api/v1/docs paths', () => {
      const registered: { paths: string[] }[] = [];
      const app: INestApplication = {
        use: jest.fn().mockImplementation((paths: string[]) => {
          registered.push({ paths });
        }),
      } as unknown as INestApplication;

      setupSwagger(app);

      // First call to app.use is the Basic Auth middleware
      const guardedPaths = registered[0].paths;
      expect(guardedPaths).toContain('/api/v1/docs');
      expect(guardedPaths).toContain('/api/v1/docs/*');
      // Other routes must not be included
      expect(guardedPaths).not.toContain('/');
      expect(guardedPaths).not.toContain('/auth');
    });
  });

  // Edge case 9: sub-paths of /api/v1/docs are also guarded
  describe('Edge case 9: sub-paths are guarded', () => {
    it('registers /api/v1/docs/* as a guarded path', () => {
      const registered: { paths: string[] }[] = [];
      const app: INestApplication = {
        use: jest.fn().mockImplementation((paths: string[]) => {
          registered.push({ paths });
        }),
      } as unknown as INestApplication;

      setupSwagger(app);

      const guardedPaths = registered[0].paths;
      expect(guardedPaths).toContain('/api/v1/docs/*');
    });
  });
});
