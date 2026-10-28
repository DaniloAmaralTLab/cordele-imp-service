import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';

import type { AuthenticatedUser } from '../../../domain/auth/authenticated-user';

/**
 * Decorator de controller que injeta o principal autenticado no parâmetro do handler.
 *
 * Importado pelos controllers a partir de `modules/` — não de `infrastructure/`.
 * Assim os controllers não importam infrastructure/.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();
    if (!request.user) {
      throw new UnauthorizedException('No authenticated principal on request');
    }
    return request.user;
  },
);
