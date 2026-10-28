import { Global, Module } from '@nestjs/common';

import { PrismaService } from './prisma.service';

/**
 * Owns the process-wide database connection.
 *
 * `@Global()` because the connection is genuinely a singleton resource; feature
 * modules still import PersistenceModule to express the dependency explicitly.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class DatabaseModule {}
