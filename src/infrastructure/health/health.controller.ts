import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckResult,
  HealthCheckService,
  PrismaHealthIndicator,
} from '@nestjs/terminus';
import { ApiTags } from '@nestjs/swagger';

import { PrismaService } from '../persistence/prisma.service';
import { Public } from '../auth/jwt-auth.guard';
import { StorageHealthIndicator } from './storage-health.indicator';

/**
 * Exposes two operational endpoints:
 *
 *  - `GET /health`  — **readiness**: the app plus every dependency it cannot
 *    serve traffic without (Prisma DB and file-storage path writability).
 *    Returns 200 when all checks pass, 503 otherwise.
 *
 *  - `GET /health/live` — **liveness**: process is running. Intentionally
 *    has zero external dependencies so Kubernetes/Docker never restarts a
 *    healthy process because a downstream is temporarily unavailable.
 *
 * Both endpoints are decorated with `@Public()` so the global `JwtAuthGuard`
 * does not require a Bearer token from infrastructure tooling.
 */
@ApiTags('ops')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prismaIndicator: PrismaHealthIndicator,
    private readonly prisma: PrismaService,
    private readonly storageIndicator: StorageHealthIndicator,
  ) {}

  /** Readiness: the app plus every dependency it cannot serve traffic without. */
  @Get()
  @Public()
  @HealthCheck()
  check(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.prismaIndicator.pingCheck('database', this.prisma),
      () => this.storageIndicator.checkStorage('storage'),
    ]);
  }

  /** Liveness: process is up. Deliberately dependency-free. */
  @Get('live')
  @Public()
  live(): { status: string } {
    return { status: 'ok' };
  }
}
