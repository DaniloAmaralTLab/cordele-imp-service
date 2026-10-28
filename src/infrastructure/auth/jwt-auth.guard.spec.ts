import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';

import { JwtAuthGuard, type AuthenticatedUser, IS_PUBLIC_KEY, REQUIRED_SCOPES_KEY } from './jwt-auth.guard';

/**
 * Unit tests for `JwtAuthGuard` — scope enforcement and tenant resolution.
 *
 * Does not test JWT cryptographic validation (that is `JwtStrategy`'s
 * responsibility and tested via e2e with real JWKS mocks). Tests here cover:
 *   - `@Public()` bypasses authentication
 *   - `@RequiredScopes()` enforces scope presence → 403 when missing
 *   - Missing `empresaId` on the token → 403
 *   - Cross-empresa attempt without `empresa-admin` role → 403
 */
describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let reflector: Reflector;

  const makeUser = (overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser => ({
    userId: 'user-1',
    username: 'alice',
    roles: [],
    scopes: ['imp:read', 'imp:write'],
    empresaId: 'aetos',
    ...overrides,
  });

  const makeContext = (
    user: AuthenticatedUser,
    headers: Record<string, string | undefined> = {},
  ): ExecutionContext =>
    ({
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ user, headers }),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        JwtAuthGuard,
        {
          provide: Reflector,
          useValue: {
            getAllAndOverride: jest.fn(),
          },
        },
      ],
    }).compile();

    guard = moduleRef.get(JwtAuthGuard);
    reflector = moduleRef.get(Reflector);
  });

  describe('enforceScopes', () => {
    it('passes when no @RequiredScopes is declared', async () => {
      (reflector.getAllAndOverride as jest.Mock).mockImplementation((key: string) => {
        if (key === IS_PUBLIC_KEY) return false;
        if (key === REQUIRED_SCOPES_KEY) return undefined;
        return undefined;
      });

      const user = makeUser();
      const ctx = makeContext(user);

      // Spy super.canActivate to avoid actual Passport flow.
      jest.spyOn(Object.getPrototypeOf(Object.getPrototypeOf(guard)), 'canActivate')
        .mockResolvedValue(true);

      await expect(guard.canActivate(ctx)).resolves.toBe(true);
    });

    it('passes when user has a required scope', async () => {
      (reflector.getAllAndOverride as jest.Mock).mockImplementation((key: string) => {
        if (key === IS_PUBLIC_KEY) return false;
        if (key === REQUIRED_SCOPES_KEY) return ['imp:write'];
        return undefined;
      });

      const user = makeUser({ scopes: ['imp:read', 'imp:write'] });
      const ctx = makeContext(user);

      jest.spyOn(Object.getPrototypeOf(Object.getPrototypeOf(guard)), 'canActivate')
        .mockResolvedValue(true);

      await expect(guard.canActivate(ctx)).resolves.toBe(true);
    });

    it('throws ForbiddenException (403) when user lacks required scope', async () => {
      (reflector.getAllAndOverride as jest.Mock).mockImplementation((key: string) => {
        if (key === IS_PUBLIC_KEY) return false;
        if (key === REQUIRED_SCOPES_KEY) return ['imp:admin'];
        return undefined;
      });

      const user = makeUser({ scopes: ['imp:read'] });
      const ctx = makeContext(user);

      jest.spyOn(Object.getPrototypeOf(Object.getPrototypeOf(guard)), 'canActivate')
        .mockResolvedValue(true);

      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    });

    it('returns true (bypass) for @Public() routes without touching scopes', async () => {
      (reflector.getAllAndOverride as jest.Mock).mockImplementation((key: string) => {
        if (key === IS_PUBLIC_KEY) return true;
        return undefined;
      });

      // No user on request — @Public() should not even try to read it.
      const ctx = makeContext(makeUser());
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
    });
  });

  describe('resolveTenant (via canActivate)', () => {
    beforeEach(() => {
      (reflector.getAllAndOverride as jest.Mock).mockImplementation((key: string) => {
        if (key === IS_PUBLIC_KEY) return false;
        if (key === REQUIRED_SCOPES_KEY) return undefined;
        return undefined;
      });
      jest.spyOn(Object.getPrototypeOf(Object.getPrototypeOf(guard)), 'canActivate')
        .mockResolvedValue(true);
    });

    it('throws ForbiddenException when token carries no empresaId', async () => {
      const user = makeUser({ empresaId: '' });
      const ctx = makeContext(user);
      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException on cross-empresa attempt without empresa-admin', async () => {
      const user = makeUser({ empresaId: 'aetos', roles: [] });
      const ctx = makeContext(user, { 'x-tenant-id': 'outro' });
      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    });

    it('allows cross-empresa override for empresa-admin role', async () => {
      const user = makeUser({ empresaId: 'aetos', roles: ['empresa-admin'] });
      const ctx = makeContext(user, { 'x-tenant-id': 'outro' });
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
    });
  });
});
