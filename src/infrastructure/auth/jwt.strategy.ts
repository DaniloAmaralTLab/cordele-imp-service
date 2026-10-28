import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { passportJwtSecret } from 'jwks-rsa';

import type { AuthenticatedUser } from './jwt-auth.guard';

interface JwtPayload {
  sub: string;
  preferred_username?: string;
  email?: string;
  scope?: string;
  realm_access?: { roles?: string[] };
  empresa_id?: string;
}

/**
 * Validates bearer tokens for cordele.
 *
 * Signing keys are fetched from the issuer's JWKS endpoint and cached — the
 * service never holds a shared secret. `JWT_ISSUER_URI` and `JWT_AUDIENCE`
 * must be set; there is no insecure default.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService) {
    const issuer = config.getOrThrow<string>('JWT_ISSUER_URI');

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      issuer,
      audience: config.getOrThrow<string>('JWT_AUDIENCE'),
      algorithms: ['RS256'],
      secretOrKeyProvider: passportJwtSecret({
        jwksUri: `${issuer}/protocol/openid-connect/certs`,
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 10,
      }),
    });
  }

  /** Maps the verified token claims onto the request-scoped principal. */
  validate(payload: JwtPayload): AuthenticatedUser {
    if (!payload.sub) {
      throw new UnauthorizedException('Token has no subject claim');
    }

    return {
      userId: payload.sub,
      username: payload.preferred_username ?? payload.email ?? payload.sub,
      roles: payload.realm_access?.roles ?? [],
      scopes: (payload.scope ?? '').split(' ').filter((scope) => scope.length > 0),
      empresaId: payload.empresa_id ?? '',
    };
  }
}
