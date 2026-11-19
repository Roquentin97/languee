import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { AppLogger } from '../logger/app-logger';
import {
  requestPath,
  requestRoute,
  safeRequestDetails,
  type HttpLogLocals,
} from '../interceptors/http-request-log';
import { requestContextStorage } from './request-context';
import { parseTraceparent, resolveRequestId } from './request-context';

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  private readonly logger = new AppLogger(RequestContextMiddleware.name);

  use(
    req: Request,
    res: Response<unknown, HttpLogLocals>,
    next: NextFunction,
  ): void {
    const started = Date.now();
    const requestId = resolveRequestId(req.headers['x-request-id']);
    const traceContext = parseTraceparent(req.headers['traceparent']);
    req.headers['x-request-id'] = requestId;
    res.setHeader('X-Request-ID', requestId);
    requestContextStorage.run({ requestId, ...traceContext }, () => {
      res.once('finish', () => this.logUnclaimedFailure(req, res, started));
      next();
    });
  }

  private logUnclaimedFailure(
    req: Request,
    res: Response<unknown, HttpLogLocals>,
    started: number,
  ): void {
    if (res.statusCode < 400 || res.locals.httpFailureLogged === true) return;

    const route = requestRoute(req);
    const routeNotFound = res.statusCode === 404 && route === undefined;
    const code = routeNotFound
      ? 'ROUTE_NOT_FOUND'
      : res.statusCode === 401
        ? 'AUTHENTICATION_FAILED'
        : res.statusCode === 403
          ? 'FORBIDDEN'
          : res.statusCode === 429
            ? 'RATE_LIMITED'
            : `HTTP_${res.statusCode}`;
    const failureStage = routeNotFound
      ? 'route'
      : res.statusCode === 401 || res.statusCode === 403
        ? 'authentication'
        : res.statusCode === 429
          ? 'rate_limit'
          : 'request_pipeline';
    const details = safeRequestDetails(
      req,
      process.env['LOG_LOOKUP_DETAILS'] === 'true',
    );

    res.locals.httpFailureLogged = true;
    this.logger.warn({
      message: 'HTTP request failed before controller logging',
      event: 'http.request.failed',
      'http.method': req.method,
      'http.route': route ?? requestPath(req),
      'url.path': requestPath(req),
      'http.status_code': res.statusCode,
      duration_ms: Date.now() - started,
      requestId: req.headers['x-request-id'],
      failure_stage: failureStage,
      'error.type': routeNotFound ? 'RouteNotFound' : 'HttpPipelineFailure',
      'error.code': code,
      ...(routeNotFound
        ? { 'error.message': 'No backend route matched this path' }
        : {}),
      ...details,
    });
  }
}
