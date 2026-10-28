import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

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
import { AdvanceProjetoStatusAdapter } from './http/advance-projeto-status.adapter';
import { CreateProjetoAdapter } from './http/create-projeto.adapter';
import { FindProjetoAdapter } from './http/find-projeto.adapter';

/**
 * Módulo HTTP real para integração IMP→PROJ (IMP-INT-001 / IMP-INT-002 / D-C).
 *
 * Substitui ProjStubModule em AppModule quando o PROJ service está disponível.
 * Usa factory condicional por env var PROJ_SERVICE_BASE_URL:
 *   - Definida → adapters HTTP reais (fetch nativo, Node 22).
 *   - Não definida → stubs in-memory (fallback; os stubs não são apagados).
 *
 * Decorado com @Global() para que ImpModule possa injetar os tokens PROJ
 * sem importar infrastructure/ diretamente (RULE-04).
 *
 * RULE-05: não importa modules/.
 * RULE-06: clientes HTTP ficam em infrastructure/proj/http/.
 * RULE-08: Logger do Nest, nunca console.log.
 */
@Global()
@Module({
  providers: [
    // Real HTTP adapters — instanciados sempre para o factory poder escolher
    CreateProjetoAdapter,
    AdvanceProjetoStatusAdapter,
    FindProjetoAdapter,
    // Stubs — mantidos como fallback quando PROJ_SERVICE_BASE_URL não está definida
    CreateProjetoEditorialStub,
    AdvanceProjetoStatusStub,
    FindProjetoStub,

    // ── Factory condicional: real se env var definida, stub caso contrário ──

    {
      provide: CREATE_PROJETO_EDITORIAL_PORT,
      useFactory: (
        config: ConfigService,
        real: CreateProjetoAdapter,
        stub: CreateProjetoEditorialStub,
      ) => (config.get<string>('PROJ_SERVICE_BASE_URL') ? real : stub),
      inject: [ConfigService, CreateProjetoAdapter, CreateProjetoEditorialStub],
    },

    {
      provide: ADVANCE_PROJETO_STATUS_PORT,
      useFactory: (
        config: ConfigService,
        real: AdvanceProjetoStatusAdapter,
        stub: AdvanceProjetoStatusStub,
      ) => (config.get<string>('PROJ_SERVICE_BASE_URL') ? real : stub),
      inject: [ConfigService, AdvanceProjetoStatusAdapter, AdvanceProjetoStatusStub],
    },

    {
      provide: FIND_PROJETO_PORT,
      useFactory: (
        config: ConfigService,
        real: FindProjetoAdapter,
        stub: FindProjetoStub,
      ) => (config.get<string>('PROJ_SERVICE_BASE_URL') ? real : stub),
      inject: [ConfigService, FindProjetoAdapter, FindProjetoStub],
    },
  ],
  exports: [CREATE_PROJETO_EDITORIAL_PORT, ADVANCE_PROJETO_STATUS_PORT, FIND_PROJETO_PORT],
})
export class ProjHttpModule {}
