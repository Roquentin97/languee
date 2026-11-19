import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { AppLogger } from '../logger/app-logger';
import {
  httpErrorDetails,
  requestPath,
  requestRoute,
  safeRequestDetails,
  type HttpLogLocals,
} from './http-request-log';

@Injectable()
export class HttpLoggingInterceptor implements NestInterceptor {
  private readonly logger = new AppLogger(HttpLoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context
      .switchToHttp()
      .getResponse<Response<unknown, HttpLogLocals>>();
    const start = Date.now();

    return next.handle().pipe(
      tap(() => {
        this.logCompletion(req, res, res.statusCode, Date.now() - start);
      }),
      catchError((err: unknown) => {
        const failure = httpErrorDetails(err, 500);
        this.logCompletion(req, res, failure.status, Date.now() - start, err);
        return throwError(() => err);
      }),
    );
  }

  private logCompletion(
    req: Request,
    res: Response<unknown, HttpLogLocals>,
    status: number,
    duration: number,
    error?: unknown,
  ): void {
    const isFailure = status >= 400;
    const failure = isFailure ? httpErrorDetails(error, status) : undefined;
    if (isFailure) res.locals.httpFailureLogged = true;

    this.logger[isFailure ? 'warn' : 'log']({
      message: isFailure ? 'HTTP request failed' : 'HTTP request completed',
      event: isFailure ? 'http.request.failed' : 'http.request.completed',
      'http.method': req.method,
      'http.route': requestRoute(req) ?? requestPath(req),
      'url.path': requestPath(req),
      'http.status_code': status,
      duration_ms: duration,
      ...(failure === undefined
        ? {}
        : {
            failure_stage: 'application',
            'error.type': failure.type,
            ...(failure.code === undefined
              ? {}
              : { 'error.code': failure.code }),
          }),
      ...safeRequestDetails(
        req,
        isFailure && process.env['LOG_LOOKUP_DETAILS'] === 'true',
      ),
    });
  }
}
