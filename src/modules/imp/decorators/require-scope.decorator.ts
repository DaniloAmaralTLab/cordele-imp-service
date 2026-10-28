import { SetMetadata } from '@nestjs/common';

/**
 * Metadata key used by JwtAuthGuard (infrastructure/auth) and test stubs to
 * read the required OAuth2 scopes for a route.
 *
 * IMPORTANT: must stay in sync with `REQUIRED_SCOPES_KEY` in
 * `src/infrastructure/auth/jwt-auth.guard.ts`.  Both files use the same
 * string literal so that guard and decorator work together without either
 * layer importing the other (RULE-04).
 */
export const REQUIRED_SCOPES_KEY = 'requiredScopes';

/**
 * Declares the OAuth2 scopes required to access a route.
 *
 * The `JwtAuthGuard` (registered as APP_GUARD in AppModule) reads this
 * metadata and enforces it after JWT validation.  If the principal's `scope`
 * claim does not include at least one of the listed scopes, a
 * `ForbiddenException` (403) is thrown.
 *
 * Lives in `modules/` so that `ImpController` can use it without importing
 * from `infrastructure/` (RULE-04).
 *
 * Example:
 * ```ts
 * \@RequiredScopes('imp:read')
 * \@Get('manuscripts/:id')
 * getManuscrito(...) {}
 * ```
 */
export const RequiredScopes = (...scopes: string[]): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRED_SCOPES_KEY, scopes);
