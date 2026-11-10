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

@Injectable()
export class HttpLoggingInterceptor implements NestInterceptor {
  private readonly logger = new AppLogger(HttpLoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const start = Date.now();

    return next.handle().pipe(
      tap(() => {
        this.logCompletion(req, res.statusCode, Date.now() - start);
      }),
      catchError((err: unknown) => {
        this.logCompletion(req, res.statusCode || 500, Date.now() - start);
        return throwError(() => err);
      }),
    );
  }

  private logCompletion(req: Request, status: number, duration: number): void {
    const route =
      (req.route as { path?: string } | undefined)?.path ?? req.path;
    this.logger.log({
      message: `${req.method} ${route} ${status}`,
      method: req.method,
      route,
      status,
      duration,
    });
  }
}
