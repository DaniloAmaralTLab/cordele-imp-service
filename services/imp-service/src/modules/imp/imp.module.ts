import { Module } from '@nestjs/common';

import { ImpController } from './imp.controller';
import { ImpService } from './imp.service';
import { ImportManuscriptUseCase } from './use-cases/import-manuscript.use-case';
import { IgnoreSegmentUseCase } from './use-cases/ignore-segment.use-case';
import { ConfirmEstruturaUseCase } from './use-cases/confirm-estrutura.use-case';
import {
  CONFIRM_ESTRUTURA_USE_CASE,
  IGNORE_SEGMENT_USE_CASE,
  IMPORT_MANUSCRIPT_USE_CASE,
} from './imp.tokens';

// Re-export para retrocompatibilidade com código que importe os tokens daqui.
export {
  IMPORT_MANUSCRIPT_USE_CASE,
  IGNORE_SEGMENT_USE_CASE,
  CONFIRM_ESTRUTURA_USE_CASE,
} from './imp.tokens';

/**
 * IMP — Importação.
 *
 * Bounded context module. Não importa infrastructure/ diretamente (RULE-04).
 * Os ports de repositório, storage, parser e event bus são providos pelos módulos
 * globais (PersistenceModule, EventBusModule) registrados em AppModule e injetados
 * via tokens de DI.
 *
 * Os stubs de PROJ (CreateProjetoEditorialPort, AdvanceProjetoStatusPort) são
 * registrados em AppModule até o PROJ service estar disponível.
 */
@Module({
  controllers: [ImpController],
  providers: [
    // P2: use cases reais substituem os placeholders useValue: null de P1.
    ImportManuscriptUseCase,
    IgnoreSegmentUseCase,
    ConfirmEstruturaUseCase,
    { provide: IMPORT_MANUSCRIPT_USE_CASE, useClass: ImportManuscriptUseCase },
    { provide: IGNORE_SEGMENT_USE_CASE, useClass: IgnoreSegmentUseCase },
    { provide: CONFIRM_ESTRUTURA_USE_CASE, useClass: ConfirmEstruturaUseCase },
    ImpService,
  ],
  exports: [ImpService],
})
export class ImpModule {}
