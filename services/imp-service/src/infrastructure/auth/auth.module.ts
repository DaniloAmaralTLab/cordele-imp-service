import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';

import { JwtStrategy } from './jwt.strategy';
import { JwtAuthGuard } from './jwt-auth.guard';

/**
 * Registers the JWT strategy once for the whole process.
 *
 * Global because `@UseGuards(JwtAuthGuard)` is applied in controllers all over
 * the app and the guard must be resolvable without a local import.
 */
@Global()
@Module({
  imports: [ConfigModule, PassportModule.register({ defaultStrategy: 'jwt' })],
  providers: [JwtStrategy, JwtAuthGuard],
  exports: [PassportModule, JwtAuthGuard],
})
export class AuthModule {}
