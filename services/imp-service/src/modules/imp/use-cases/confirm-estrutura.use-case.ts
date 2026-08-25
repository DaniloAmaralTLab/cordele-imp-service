import { Inject, Injectable, Logger } from '@nestjs/common';

import type { ManuscritoRepositoryPort } from '../../../domain/imp/ports/manuscrito-repository.port';
import { MANUSCRITO_REPOSITORY_PORT } from '../../../domain/imp/ports/manuscrito-repository.port';
import type { AdvanceProjetoStatusPort } from '../../../domain/imp/ports/proj-port';
import { ADVANCE_PROJETO_STATUS_PORT } from '../../../domain/imp/ports/proj-port';
import {
  ManuscritoNaoEncontradoError,
  ProjetoIntegrationError,
} from '../../../domain/imp/errors';

export interface ConfirmEstruturaCommand {
  readonly manuscritoId: string;
  /** Slug da empresa — requerido antes do primeiro acesso ao repositório (RULE-07). */
  readonly empresaId: string;
}

/**
 * Use case: ConfirmEstruturaUseCase (IMP-008).
 *
 * Confirma a estrutura do manuscrito e avança o ProjetoEditorial para Composição.
 * Idempotente: segunda chamada não lança exceção (AdvanceProjetoStatusPort é idempotente).
 *
 * Não importa @prisma/client nem infrastructure/ (RULE-01/02/04).
 * empresaId requerido antes de qualquer acesso ao repositório (RULE-07).
 */
@Injectable()
export class ConfirmEstruturaUseCase {
  private readonly logger = new Logger(ConfirmEstruturaUseCase.name);

  constructor(
    @Inject(MANUSCRITO_REPOSITORY_PORT)
    private readonly manuscritoRepo: ManuscritoRepositoryPort,

    @Inject(ADVANCE_PROJETO_STATUS_PORT)
    private readonly advanceProjeto: AdvanceProjetoStatusPort,
  ) {}

  async execute(command: ConfirmEstruturaCommand): Promise<void> {
    const { manuscritoId, empresaId } = command;

    // RULE-07: empresaId requerido antes do primeiro repositório.
    const manuscrito = await this.manuscritoRepo.findById(manuscritoId, empresaId);
    if (!manuscrito) {
      throw new ManuscritoNaoEncontradoError(manuscritoId);
    }

    // Avança o ProjetoEditorial para COMPOSICAO (idempotente — o port stub não lança).
    try {
      await this.advanceProjeto.advance({
        projetoId: manuscrito.projetoId,
        targetStatus: 'COMPOSICAO',
        empresaId,
      });
    } catch (err) {
      throw new ProjetoIntegrationError(
        err instanceof Error ? err.message : String(err),
        err,
      );
    }

    this.logger.log(
      `Estrutura do manuscrito '${manuscritoId}' confirmada — empresa=${empresaId}`,
    );
  }
}
