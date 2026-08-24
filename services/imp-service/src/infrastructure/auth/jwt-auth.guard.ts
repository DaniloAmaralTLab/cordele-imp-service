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

/** Opts a route out of authentication (health checks, webhooks, docs). */
export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_PUBLIC_KEY, true);

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
 * Runs the `jwt` Passport strategy, honours `@Public()` and resolves the
 * empresa from the token (with an `X-Tenant-Id` header override
 * that is only accepted for principals holding the `empresa-admin` role).
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  // `override` is required: AuthGuard('jwt') already declares canActivate, and
  // the generated tsconfig enables noImplicitOverride (TS4114). Without it the
  // service does not compile — which no one saw while the node gates never ran.
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
    return true;
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
