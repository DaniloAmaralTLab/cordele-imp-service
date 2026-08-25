import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';

import { EmpresaContextService } from './empresa-context.service';
import { EmpresaContextMiddleware } from './empresa-context.middleware';
import { JwtStrategy } from './jwt.strategy';
import { JwtAuthGuard } from './jwt-auth.guard';

/**
 * Registers the JWT strategy and empresa context services once for the whole process.
 *
 * Global because `@UseGuards(JwtAuthGuard)` is applied in controllers all over
 * the app and the guard must be resolvable without a local import.
 *
 * `EmpresaContextService` is exported globally so any provider (repositories,
 * mapper factories) can inject it without declaring an import in their own module.
 *
 * `EmpresaContextMiddleware` is registered in `AppModule` (via `configure()`)
 * to cover all routes without `ImpModule` importing from `infrastructure/`.
 */
@Global()
@Module({
  imports: [ConfigModule, PassportModule.register({ defaultStrategy: 'jwt' })],
  providers: [JwtStrategy, JwtAuthGuard, EmpresaContextService, EmpresaContextMiddleware],
  exports: [PassportModule, JwtAuthGuard, EmpresaContextService, EmpresaContextMiddleware],
})
export class AuthModule {}
