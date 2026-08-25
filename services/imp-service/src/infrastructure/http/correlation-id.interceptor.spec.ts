import { ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';

import {
  CORRELATION_ID_HEADER,
  CorrelationIdInterceptor,
} from './correlation-id.interceptor';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createContext(
  headers: Record<string, string | undefined> = {},
): { context: ExecutionContext; setHeader: jest.Mock } {
  const setHeader = jest.fn<void, [string, string]>();
  const context = {
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
      getResponse: () => ({ setHeader }),
    }),
  } as unknown as ExecutionContext;
  return { context, setHeader };
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CorrelationIdInterceptor', () => {
  let interceptor: CorrelationIdInterceptor;

  beforeEach(() => {
    interceptor = new CorrelationIdInterceptor();
  });

  describe('when X-Correlation-Id is present in the request', () => {
    it('should echo the same value in the response header', (done) => {
      const { context, setHeader } = createContext({
        [CORRELATION_ID_HEADER]: 'caller-provided-id',
      });
      const callHandler = { handle: () => of(null) };

      interceptor.intercept(context, callHandler).subscribe({
        complete: () => {
          expect(setHeader).toHaveBeenCalledWith(
            CORRELATION_ID_HEADER,
            'caller-provided-id',
          );
          done();
        },
      });
    });
  });

  describe('when X-Correlation-Id is absent from the request', () => {
    it('should generate a valid UUID v4 and set it on the response', (done) => {
      const { context, setHeader } = createContext({});
      const callHandler = { handle: () => of(null) };

      interceptor.intercept(context, callHandler).subscribe({
        complete: () => {
          expect(setHeader).toHaveBeenCalledTimes(1);
          const [name, value] = setHeader.mock.calls[0] as [string, string];
          expect(name).toBe(CORRELATION_ID_HEADER);
          expect(value).toMatch(UUID_PATTERN);
          done();
        },
      });
    });

    it('should generate a distinct UUID for each request', async () => {
      const ids: string[] = [];

      for (const _ of [1, 2]) {
        await new Promise<void>((resolve) => {
          const { context, setHeader } = createContext({});
          interceptor
            .intercept(context, { handle: () => of(null) })
            .subscribe({
              complete: () => {
                ids.push((setHeader.mock.calls[0] as [string, string])[1]);
                resolve();
              },
            });
        });
      }

      expect(ids).toHaveLength(2);
      expect(ids[0]).not.toBe(ids[1]);
    });
  });

  describe('header passthrough', () => {
    it('should propagate the observable from the call handler unchanged', (done) => {
      const { context } = createContext({});
      const payload = { id: 42 };
      const callHandler = { handle: () => of(payload) };

      interceptor.intercept(context, callHandler).subscribe({
        next: (value) => {
          expect(value).toBe(payload);
        },
        complete: () => {
          done();
        },
      });
    });
  });
});
