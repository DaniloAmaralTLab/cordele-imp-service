import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

import { EmpresaContextService } from './empresa-context.service';

/**
 * EmpresaContextMiddleware — popula `AsyncLocalStorage` com o contexto de empresa
 * antes de qualquer guard ou handler ser executado.
 *
 * NestJS lifecycle: Middleware → Guard → Interceptor → Handler.
 * O middleware roda ANTES dos guards, portanto extrai o `empresa_id` diretamente
 * do payload JWT (decodificado sem verificação criptográfica). A verificação
 * real acontece no `JwtAuthGuard` logo em seguida.
 *
 * Segurança: um token forjado com `empresa_id` errado ainda não passa no guard
 * (assinatura inválida → 401). O middleware apenas adianta o roteamento de
 * contexto para que a `AsyncLocalStorage` esteja disponível em toda a cadeia.
 *
 * Rotas sem Bearer token (ex.: `/health`) recebem `next()` sem contexto; o guard
 * delas é `@Public()` e os repositórios nunca são atingidos.
 *
 * @see docs/architecture/shared/multi-empresa.md
 */
@Injectable()
export class EmpresaContextMiddleware implements NestMiddleware {
  private readonly logger = new Logger(EmpresaContextMiddleware.name);

  constructor(private readonly empresaContextService: EmpresaContextService) {}

  use(req: Request, _res: Response, next: NextFunction): void {
    const authHeader = req.headers['authorization'];

    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const parts = token.split('.');

      if (parts.length === 3) {
        try {
          // Decode only — verification happens in JwtAuthGuard.
          const raw = Buffer.from(parts[1], 'base64url').toString('utf8');
          const payload = JSON.parse(raw) as {
            sub?: string;
            empresa_id?: string;
          };

          const userId = payload.sub ?? '';
          const empresaId = payload.empresa_id ?? '';

          if (userId && empresaId) {
            this.empresaContextService.run({ userId, empresaId }, () => next());
            return;
          }
        } catch (err) {
          // Malformed token — guard will emit 401; proceed without context.
          this.logger.warn(
            `EmpresaContextMiddleware: failed to decode JWT payload — ${String(err)}`,
          );
        }
      }
    }

    // No usable token: call next without context.
    // Guard will emit 401 for protected routes.
    next();
  }
}
