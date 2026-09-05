import { Inject, Injectable, Logger } from '@nestjs/common';

import type { ManuscritoRepositoryPort, ManuscritoSummaryRecord } from '../../../domain/imp/ports/manuscrito-repository.port';
import { MANUSCRITO_REPOSITORY_PORT } from '../../../domain/imp/ports/manuscrito-repository.port';

export interface GetManuscritoSummariesCommand {
  readonly projetoIds: string[];
  readonly empresaId: string;
}

/**
 * Use case de consulta em lote de sumários de manuscrito por projeto.
 *
 * Consumido internamente pelo endpoint `POST /api/imp/manuscripts/summaries`,
 * chamado pelo proj-service para popular cards da biblioteca de projetos.
 *
 * RULE-07: empresaId requerido antes de qualquer repositório.
 * RULE-04: não importa infrastructure/ diretamente.
 */
@Injectable()
export class GetManuscritoSummariesUseCase {
  private readonly logger = new Logger(GetManuscritoSummariesUseCase.name);

  constructor(
    @Inject(MANUSCRITO_REPOSITORY_PORT)
    private readonly manuscritoRepo: ManuscritoRepositoryPort,
  ) {}

  async execute(cmd: GetManuscritoSummariesCommand): Promise<ManuscritoSummaryRecord[]> {
    this.logger.log(
      `getSummaries — projetoIds=${cmd.projetoIds.length} empresa=${cmd.empresaId}`,
    );
    if (cmd.projetoIds.length === 0) return [];
    return this.manuscritoRepo.findSummariesByProjetoIds(cmd.projetoIds, cmd.empresaId);
  }
}
