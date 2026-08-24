import { Module } from '@nestjs/common';

import { PersistenceModule } from '../../infrastructure/persistence/persistence.module';
import { ImpDomainService } from '../../domain/imp.domain-service';
import { ImpRepositoryPort } from '../../domain/imp.repository.interface';
import { PrismaImpRepository } from '../../infrastructure/persistence/prisma-imp.repository';
import { ImpController } from './imp.controller';
import { ImpService } from './imp.service';

/**
 * IMP — IMP.
 *
 * Bounded context module. The repository port is bound to its Prisma adapter
 * here, which is the only place in the module that knows persistence exists.
 */
@Module({
  imports: [
    PersistenceModule,
  ],
  controllers: [ImpController],
  providers: [
    ImpService,
    ImpDomainService,
    { provide: ImpRepositoryPort, useClass: PrismaImpRepository },
  ],
  exports: [ImpService],
})
export class ImpModule {}
