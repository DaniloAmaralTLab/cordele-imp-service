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
    // D-603: registered by factory because the domain service carries no Nest
    // decorator — ADR-001-hexagonal-node rule 7 keeps `src/domain/` free of
    // `@nestjs/*`. The wiring belongs here, in the application layer, not there.
    {
      provide: ImpDomainService,
      useFactory: () => new ImpDomainService(),
    },
    { provide: ImpRepositoryPort, useClass: PrismaImpRepository },
  ],
  exports: [ImpService],
})
export class ImpModule {}
