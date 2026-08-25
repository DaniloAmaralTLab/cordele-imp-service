import type { Request, Response } from 'express';

import { EmpresaContextMiddleware } from './empresa-context.middleware';
import { EmpresaContextService } from './empresa-context.service';

/**
 * Unit tests for `EmpresaContextMiddleware`.
 *
 * Verifies that the middleware:
 *   - decodes a valid Bearer JWT and runs the `AsyncLocalStorage` context
 *   - falls through to `next()` without context for requests with no token
 *   - falls through to `next()` for a malformed (non-base64) payload
 *   - does NOT verify the token cryptographically (that is the guard's job)
 */
describe('EmpresaContextMiddleware', () => {
  let empresaContextService: EmpresaContextService;
  let middleware: EmpresaContextMiddleware;

  /** Builds a minimal fake JWT with the given payload (unsigned — sufficient for decode-only). */
  const buildFakeJwt = (payload: Record<string, unknown>): string => {
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = 'fakesig';
    return `${header}.${body}.${sig}`;
  };

  const makeReq = (authorization?: string): Request =>
    ({ headers: { authorization } }) as unknown as Request;

  const makeRes = (): Response => ({}) as unknown as Response;

  beforeEach(() => {
    empresaContextService = new EmpresaContextService();
    middleware = new EmpresaContextMiddleware(empresaContextService);
  });

  it('populates EmpresaContext and calls next inside run() when a valid Bearer is present', () => {
    const token = buildFakeJwt({ sub: 'user-42', empresa_id: 'aetos' });
    const req = makeReq(`Bearer ${token}`);

    let capturedUserId: string | undefined;
    let capturedEmpresaId: string | undefined;

    const next = jest.fn(() => {
      const ctx = empresaContextService.get();
      capturedUserId = ctx?.userId;
      capturedEmpresaId = ctx?.empresaId;
    });

    middleware.use(req, makeRes(), next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(capturedUserId).toBe('user-42');
    expect(capturedEmpresaId).toBe('aetos');
  });

  it('calls next without context when no Authorization header is present', () => {
    const req = makeReq(undefined);
    const next = jest.fn(() => {
      expect(empresaContextService.get()).toBeUndefined();
    });

    middleware.use(req, makeRes(), next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('calls next without context for a Bearer token with missing claims', () => {
    // Token with no sub or empresa_id.
    const token = buildFakeJwt({ iss: 'cordele' });
    const req = makeReq(`Bearer ${token}`);

    const next = jest.fn(() => {
      expect(empresaContextService.get()).toBeUndefined();
    });

    middleware.use(req, makeRes(), next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('calls next without context when the Authorization value is not a Bearer', () => {
    const req = makeReq('Basic dXNlcjpwYXNz');
    const next = jest.fn(() => {
      expect(empresaContextService.get()).toBeUndefined();
    });

    middleware.use(req, makeRes(), next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('calls next without context when the JWT payload is not valid JSON', () => {
    const header = Buffer.from('{"alg":"RS256"}').toString('base64url');
    const badBody = '!!!notbase64!!!';
    const req = makeReq(`Bearer ${header}.${badBody}.sig`);

    const next = jest.fn(() => {
      expect(empresaContextService.get()).toBeUndefined();
    });

    middleware.use(req, makeRes(), next);

    expect(next).toHaveBeenCalledTimes(1);
  });
});
