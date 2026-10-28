import { Injectable, Logger } from '@nestjs/common';

import type {
  AdvanceProjetoStatusInput,
  AdvanceProjetoStatusPort,
  CreateProjetoEditorialInput,
  CreateProjetoEditorialOutput,
  CreateProjetoEditorialPort,
} from '../../domain/imp/ports/proj-port';
import type { FindProjetoOutput, FindProjetoPort } from '../../domain/imp/ports/find-projeto.port';

/**
 * Stub in-memory para CreateProjetoEditorialPort.
 *
 * Registrado em AppModule até o PROJ service estar disponível.
 * Retorna um projetoId sintético baseado no manuscritoId.
 * NÃO importa infrastructure/persistence/.
 */
@Injectable()
export class CreateProjetoEditorialStub implements CreateProjetoEditorialPort {
  private readonly logger = new Logger(CreateProjetoEditorialStub.name);

  async create(
    input: CreateProjetoEditorialInput,
  ): Promise<CreateProjetoEditorialOutput> {
    this.logger.warn(
      `[STUB] CreateProjetoEditorialPort.create — manuscritoId=${input.manuscritoId} empresa=${input.empresaId}`,
    );
    return { projetoId: `proj-stub-${input.manuscritoId}` };
  }
}

/**
 * Stub in-memory para AdvanceProjetoStatusPort.
 *
 * Registrado em AppModule até o PROJ service estar disponível.
 * Idempotente: chamadas repetidas não lançam exceção.
 */
@Injectable()
export class AdvanceProjetoStatusStub implements AdvanceProjetoStatusPort {
  private readonly logger = new Logger(AdvanceProjetoStatusStub.name);

  async advance(input: AdvanceProjetoStatusInput): Promise<void> {
    this.logger.warn(
      `[STUB] AdvanceProjetoStatusPort.advance — projetoId=${input.projetoId} targetStatus=${input.targetStatus} empresa=${input.empresaId}`,
    );
  }
}

/**
 * Stub in-memory para FindProjetoPort.
 *
 * Registrado em ProjStubModule para uso em desenvolvimento e testes.
 * Aceita qualquer projetoId (simula que todo projeto existe na empresa ativa).
 * Em produção, substituído por um adapter HTTP ou in-process que consulta PROJ.
 */
@Injectable()
export class FindProjetoStub implements FindProjetoPort {
  private readonly logger = new Logger(FindProjetoStub.name);

  async findById(projetoId: string, empresaId: string): Promise<FindProjetoOutput | null> {
    this.logger.warn(
      `[STUB] FindProjetoPort.findById — projetoId=${projetoId} empresa=${empresaId} → aceito`,
    );
    // Stub de desenvolvimento: todo projetoId é considerado existente.
    return { projetoId };
  }
}
