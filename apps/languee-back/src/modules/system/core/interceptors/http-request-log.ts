import { HttpException, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import { isRecord, safeCode } from './http-log-values';

export type RequestLogPolicy = (
  request: Request,
  includeContent: boolean,
) => Record<string, unknown>;
export const REQUEST_LOG_POLICY = 'requestLogPolicy';
export const LogRequestWith = (policy: RequestLogPolicy) =>
  SetMetadata(REQUEST_LOG_POLICY, policy);

export interface HttpErrorDetails {
  status: number;
  type: string;
  code?: string;
}

export interface HttpLogLocals {
  httpFailureLogged?: boolean;
}

export function requestPath(request: Request): string {
  return request.path.split(/[?#]/, 1)[0] ?? '/';
}

export function requestRoute(request: Request): string | undefined {
  const routeInfo: unknown = request.route;
  if (!isRecord(routeInfo)) return undefined;
  const path = routeInfo['path'];
  if (typeof path !== 'string') return undefined;
  const prefix = request.baseUrl.replace(/\/$/, '');
  const routeTemplate = `${prefix}/${path}`.replace(/\/{2,}/g, '/');
  return routeTemplate.startsWith('/') ? routeTemplate : `/${routeTemplate}`;
}

export function httpErrorDetails(
  error: unknown,
  fallbackStatus: number,
): HttpErrorDetails {
  if (!(error instanceof HttpException)) {
    return {
      status: validStatus(fallbackStatus) ? fallbackStatus : 500,
      type: error instanceof Error ? error.name : 'UnknownError',
    };
  }

  const response = error.getResponse();
  const candidates =
    typeof response === 'string'
      ? [response]
      : isRecord(response)
        ? [response['code'], response['error'], response['message']]
        : [];
  const code = candidates
    .map((candidate) =>
      safeCode(Array.isArray(candidate) ? candidate[0] : candidate),
    )
    .find((candidate) => candidate !== undefined);
  return {
    status: error.getStatus(),
    type: error.name,
    ...(code === undefined ? {} : { code }),
  };
}

function validStatus(status: number): boolean {
  return Number.isInteger(status) && status >= 100 && status <= 599;
}

export enum LookupLogMode {
  ALLOWED = 'allowed',
  FAILED_ONLY = 'failed-only',
  DISABLED = 'disabled',
}

export function captureLookupContent(isFailure: boolean): boolean {
  const mode = process.env['LOG_LOOKUP_DETAILS'];
  return (
    mode === LookupLogMode.ALLOWED ||
    (mode === LookupLogMode.FAILED_ONLY && isFailure)
  );
}
