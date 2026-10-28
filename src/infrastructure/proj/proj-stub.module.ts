import { Global, Module } from '@nestjs/common';

import {
  ADVANCE_PROJETO_STATUS_PORT,
  CREATE_PROJETO_EDITORIAL_PORT,
} from '../../domain/imp/ports/proj-port';
import { FIND_PROJETO_PORT } from '../../domain/imp/ports/find-projeto.port';
import {
  AdvanceProjetoStatusStub,
  CreateProjetoEditorialStub,
  FindProjetoStub,
} from './proj-port.stub';

/**
 * Módulo de stubs PROJ.
 *
 * Decorado com @Global() para que ImpModule (e qualquer use case dentro dele)
 * possa injetar os tokens PROJ sem precisar importar infrastructure/ diretamente.
 *
 * Substituído por um módulo HTTP-client real quando o PROJ service estiver disponível.
 *
 * Segue o mesmo padrão de PersistenceModule / EventBusModule.
 */
@Global()
@Module({
  providers: [
    CreateProjetoEditorialStub,
    { provide: CREATE_PROJETO_EDITORIAL_PORT, useClass: CreateProjetoEditorialStub },
    AdvanceProjetoStatusStub,
    { provide: ADVANCE_PROJETO_STATUS_PORT, useClass: AdvanceProjetoStatusStub },
    FindProjetoStub,
    { provide: FIND_PROJETO_PORT, useClass: FindProjetoStub },
  ],
  exports: [CREATE_PROJETO_EDITORIAL_PORT, ADVANCE_PROJETO_STATUS_PORT, FIND_PROJETO_PORT],
})
export class ProjStubModule {}
