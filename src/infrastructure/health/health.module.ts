import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';

import { HealthController } from './health.controller';
import { StorageHealthIndicator } from './storage-health.indicator';

/**
 * Health-check module.
 *
 * `TerminusModule` provides and exports all built-in health indicators,
 * including `HealthCheckService` and `PrismaHealthIndicator`.
 * `PrismaService` is available globally via the `@Global()` `DatabaseModule`.
 *
 * `StorageHealthIndicator` is a custom indicator and must be declared as a
 * local provider so it participates in the module's DI container.
 */
@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [StorageHealthIndicator],
})
export class HealthModule {}
