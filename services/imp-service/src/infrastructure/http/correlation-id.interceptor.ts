import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';

/** Lowercase header name used for distributed request tracing. */
export const CORRELATION_ID_HEADER = 'x-correlation-id';

/**
 * Global NestJS interceptor that ensures every HTTP response carries an
 * `X-Correlation-Id` header.
 *
 * Behaviour:
 *  - If the inbound request already contains the header, the same value is
 *    echoed back in the response (allows callers to correlate across services).
 *  - When the header is absent, a new UUID v4 is generated via the built-in
 *    `crypto.randomUUID()` (Node ≥ 14.17, no external dependency required).
 *
 * Wired globally via `APP_INTERCEPTOR` in `AppModule` so the header is
 * present on every response — including error paths handled by exception
 * filters (RULE-08: no `console.log`; interceptor uses no logging because
 * every route already benefits from the Nest request lifecycle logger).
 */
@Injectable()
export class CorrelationIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<{
      headers: Record<string, string | undefined>;
    }>();
    const response = http.getResponse<{
      setHeader: (name: string, value: string) => void;
    }>();

    const correlationId: string =
      request.headers[CORRELATION_ID_HEADER] ?? crypto.randomUUID();

    response.setHeader(CORRELATION_ID_HEADER, correlationId);

    return next.handle();
  }
}
