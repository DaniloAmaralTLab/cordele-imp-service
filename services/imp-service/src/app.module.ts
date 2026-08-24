import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { DatabaseModule } from './infrastructure/persistence/database.module';
import { AuthModule } from './infrastructure/auth/auth.module';
import { HealthModule } from './infrastructure/health/health.module';
import { ImpModule } from './modules/imp/imp.module';

/**
 * Root composition module for cordele.
 *
 * Feature modules map one-to-one to bounded contexts; they must never import
 * each other's providers directly — cross-context communication goes through
 * published contracts (HTTP or the message broker).
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ['.env.local', '.env'],
    }),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),
    HealthModule,
    DatabaseModule,
    AuthModule,
    ImpModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
