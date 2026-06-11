from __future__ import annotations

import logging
import time
import uuid

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger("languee_nlp.http")

_SKIP_PATHS = {"/health", "/ready"}


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: object) -> Response:
        request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
        skip = request.url.path in _SKIP_PATHS
        start = time.perf_counter()

        try:
            response: Response = await call_next(request)  # type: ignore[operator]
        except Exception as exc:
            logger.error(
                "Unhandled exception",
                exc_info=True,
                extra={
                    "requestId": request_id,
                    "error": {
                        "type": type(exc).__name__,
                        "message": str(exc),
                    },
                },
            )
            raise

        if not skip:
            duration = round((time.perf_counter() - start) * 1000, 2)
            logger.info(
                "Request completed",
                extra={
                    "requestId": request_id,
                    "request": {
                        "method": request.method,
                        "path": request.url.path,
                        "url": str(request.url),
                        "client": request.client.host if request.client else None,
                    },
                    "response": {
                        "statusCode": response.status_code,
                    },
                    "duration": duration,
                },
            )

        response.headers["X-Request-ID"] = request_id
        return response
