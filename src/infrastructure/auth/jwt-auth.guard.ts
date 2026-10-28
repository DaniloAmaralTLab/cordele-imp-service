import {
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';

/** Request-scoped principal produced by `JwtStrategy.validate`. */
export interface AuthenticatedUser {
  readonly userId: string;
  readonly username: string;
  readonly roles: string[];
  readonly scopes: string[];
  /** Resolved empresa — every repository call is scoped by it. */
  readonly empresaId: string;
}

export const IS_PUBLIC_KEY = 'isPublic';
export const REQUIRED_SCOPES_KEY = 'requiredScopes';

/** Opts a route out of authentication (health checks, webhooks, docs). */
export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_PUBLIC_KEY, true);

/**
 * Declares the OAuth2 scopes required to access a route.
 *
 * The `JwtAuthGuard` reads this metadata and enforces it after JWT validation.
 * If the principal's `scope` claim does not include at least one of the listed
 * scopes, a `ForbiddenException` (403) is thrown.
 *
 * Example:
 * ```ts
 * \@RequiredScopes('imp:write')
 * \@Post('manuscripts')
 * uploadManuscrito(...) {}
 * ```
 */
export const RequiredScopes = (...scopes: string[]): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRED_SCOPES_KEY, scopes);

/** Injects the authenticated principal into a controller handler. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    if (!request.user) {
      throw new UnauthorizedException('No authenticated principal on request');
    }
    return request.user;
  },
);

/**
 * Bearer-token guard for cordele.
 *
 * Runs the `jwt` Passport strategy, honours `@Public()`, validates OAuth2 scopes
 * declared via `@RequiredScopes()`, and resolves the empresa from the token
 * (with an `X-Tenant-Id` header override accepted only for `empresa-admin`).
 *
 * Responses:
 *   401 — no token or expired token
 *   403 — valid token but missing required scope or cross-empresa attempt
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  // `override` is required: AuthGuard('jwt') already declares canActivate, and
  // the tsconfig enables noImplicitOverride (TS4114). Without it the service
  // does not compile.
  override async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const allowed = (await super.canActivate(context)) as boolean;
    if (!allowed) {
      return false;
    }

    const request = context.switchToHttp().getRequest<{
      user: AuthenticatedUser;
      headers: Record<string, string | string[] | undefined>;
    }>();

    request.user = this.resolveTenant(request.user, request.headers['x-tenant-id']);
    this.enforceScopes(context, request.user);

    return true;
  }

  /**
   * Validates that the principal holds at least one of the scopes required by
   * the handler (or its class). No-op when `@RequiredScopes()` is not applied.
   */
  private enforceScopes(context: ExecutionContext, user: AuthenticatedUser): void {
    const required = this.reflector.getAllAndOverride<string[] | undefined>(
      REQUIRED_SCOPES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!required || required.length === 0) {
      return;
    }

    const hasScope = required.some((s) => user.scopes.includes(s));
    if (!hasScope) {
      throw new ForbiddenException(
        `Insufficient scope. Required one of: ${required.join(', ')}`,
      );
    }
  }

  private resolveTenant(
    user: AuthenticatedUser,
    header: string | string[] | undefined,
  ): AuthenticatedUser {
    const requested = Array.isArray(header) ? header[0] : header;

    if (requested && requested !== user.empresaId) {
      if (!user.roles.includes('empresa-admin')) {
        throw new ForbiddenException('Not allowed to act on behalf of another empresa');
      }
      return { ...user, empresaId: requested };
    }

    if (!user.empresaId) {
      throw new ForbiddenException('Token carries no empresa claim');
    }
    return user;
  }
}
