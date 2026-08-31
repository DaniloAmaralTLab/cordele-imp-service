import { Inject, Injectable, Logger } from '@nestjs/common';

import type { FileStoragePort } from '../../../domain/imp/ports/file-storage.port';
import { FILE_STORAGE_PORT } from '../../../domain/imp/ports/file-storage.port';
import type { ManuscritoRepositoryPort } from '../../../domain/imp/ports/manuscrito-repository.port';
import { MANUSCRITO_REPOSITORY_PORT } from '../../../domain/imp/ports/manuscrito-repository.port';

/**
 * Input do use case de cascade delete de projeto.
 *
 * Disparado quando o PROJ service publica ProjetoDeletedEvent:
 * todos os manuscritos daquele projeto são purged (binários) e removidos do banco.
 */
export interface CascadeDeleteProjetoInput {
  readonly projetoId: string;
  readonly empresaId: string;
}

/**
 * CascadeDeleteProjetoUseCase — use case de deleção em cascata (IMP-INT-005 / P7).
 *
 * Orquestra a remoção de todos os manuscritos de um projeto:
 *   1. Carrega os manuscritos via ManuscritoRepositoryPort.findByProjetoId
 *   2. Purga os binários via FileStoragePort.delete (best-effort; falhas são logadas)
 *   3. Remove os registros via ManuscritoRepositoryPort.deleteByProjetoId
 *
 * Não importa @prisma/client (RULE-01). Não importa @nestjs/common além de decoradores
 * de DI (RULE-02 aplica-se a domain/, não a modules/). Não importa infrastructure/ (RULE-04).
 */
@Injectable()
export class CascadeDeleteProjetoUseCase {
  private readonly logger = new Logger(CascadeDeleteProjetoUseCase.name);

  constructor(
    @Inject(MANUSCRITO_REPOSITORY_PORT)
    private readonly manuscritoRepo: ManuscritoRepositoryPort,

    @Inject(FILE_STORAGE_PORT)
    private readonly fileStorage: FileStoragePort,
  ) {}

  async execute(input: CascadeDeleteProjetoInput): Promise<void> {
    const { projetoId, empresaId } = input;
    this.logger.log(
      `CascadeDeleteProjeto — projetoId=${projetoId} empresa=${empresaId}`,
    );

    // Step 1: load all manuscripts for the projeto (within the empresa)
    const manuscritos = await this.manuscritoRepo.findByProjetoId(
      projetoId,
      empresaId,
    );

    this.logger.log(
      `CascadeDeleteProjeto — ${manuscritos.length} manuscript(s) to purge for projetoId=${projetoId}`,
    );

    // Step 2: purge stored binaries (best-effort — individual failures are logged, not thrown)
    for (const ms of manuscritos) {
      try {
        await this.fileStorage.delete(ms.storageKey);
        this.logger.log(
          `CascadeDeleteProjeto — purged storageKey=${ms.storageKey}`,
        );
      } catch (err) {
        this.logger.warn(
          `CascadeDeleteProjeto — failed to purge storageKey=${ms.storageKey}: ${String(err)}`,
        );
      }
    }

    // Step 3: cascade delete all manuscripts of the projeto from the repository
    await this.manuscritoRepo.deleteByProjetoId(projetoId, empresaId);

    this.logger.log(
      `CascadeDeleteProjeto — cascade delete completed for projetoId=${projetoId}`,
    );
  }
}
