import { HealthCheckResult, HealthCheckService, PrismaHealthIndicator } from '@nestjs/terminus';
import { PrismaService } from '../persistence/prisma.service';
export declare class HealthController {
    private readonly health;
    private readonly prismaIndicator;
    private readonly prisma;
    constructor(health: HealthCheckService, prismaIndicator: PrismaHealthIndicator, prisma: PrismaService);
    check(): Promise<HealthCheckResult>;
    live(): {
        status: string;
    };
}
