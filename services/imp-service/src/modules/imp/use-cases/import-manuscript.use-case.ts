import { Inject, Injectable, Logger } from '@nestjs/common';

import type { IEventBus } from '../../../domain/imp/ports/event-bus.port';
import { EVENT_BUS_PORT } from '../../../domain/imp/ports/event-bus.port';
import type { FileStoragePort } from '../../../domain/imp/ports/file-storage.port';
import { FILE_STORAGE_PORT } from '../../../domain/imp/ports/file-storage.port';
import type { ManuscriptParserPort } from '../../../domain/imp/ports/manuscript-parser.port';
import {
  MANUSCRIPT_PARSER_PORT,
  ManuscriptParseError,
} from '../../../domain/imp/ports/manuscript-parser.port';
import type { ManuscritoRepositoryPort } from '../../../domain/imp/ports/manuscrito-repository.port';
import { MANUSCRITO_REPOSITORY_PORT } from '../../../domain/imp/ports/manuscrito-repository.port';
import type {
  CreateProjetoEditorialPort,
} from '../../../domain/imp/ports/proj-port';
import { CREATE_PROJETO_EDITORIAL_PORT } from '../../../domain/imp/ports/proj-port';
import { ManuscriptImportRejectedEvent } from '../../../domain/imp/events/manuscript-import-rejected.event';
import { ManuscriptImportedEvent } from '../../../domain/imp/events/manuscript-imported.event';
import { Manuscrito } from '../../../domain/imp/manuscrito.entity';
import type { ManuscritoMimeType } from '../../../domain/imp/manuscrito.entity';
import { ManuscritoDetailDto } from '../dto/manuscrito-detail.dto';
import { resolveProjectBinding } from './resolve-project-binding';

export interface ImportManuscriptCommand {
  readonly projetoId: string;
  readonly filename: string;
  readonly mimeType: string;
  readonly fileBuffer: Buffer;
  /** Slug da empresa — requerido para isolamento multi-empresa (RULE-07). */
  readonly empresaId: string;
}

/**
 * Use case: ImportManuscriptUseCase (IMP-004 + IMP-005 + IMP-006).
 *
 * Orquestra: parse do arquivo → armazenamento → criação do agregado →
 * binding ao projeto → persistência → emissão de evento.
 *
 * Não importa @prisma/client nem infrastructure/ diretamente (RULE-01/02/04).
 * empresaId requerido antes do primeiro acesso ao repositório (RULE-07).
 */
@Injectable()
export class ImportManuscriptUseCase {
  private readonly logger = new Logger(ImportManuscriptUseCase.name);

  constructor(
    @Inject(MANUSCRIPT_PARSER_PORT)
    private readonly parser: ManuscriptParserPort,

    @Inject(FILE_STORAGE_PORT)
    private readonly fileStorage: FileStoragePort,

    @Inject(MANUSCRITO_REPOSITORY_PORT)
    private readonly manuscritoRepo: ManuscritoRepositoryPort,

    @Inject(CREATE_PROJETO_EDITORIAL_PORT)
    private readonly createProjeto: CreateProjetoEditorialPort,

    @Inject(EVENT_BUS_PORT)
    private readonly eventBus: IEventBus,
  ) {}

  async execute(command: ImportManuscriptCommand): Promise<ManuscritoDetailDto> {
    const { projetoId, filename, mimeType, fileBuffer, empresaId } = command;

    // Valida suporte do parser antes de qualquer operação de I/O.
    if (!this.parser.supports(mimeType)) {
      const rejectedEvent = new ManuscriptImportRejectedEvent(
        filename,
        empresaId,
        `Unsupported mimeType: ${mimeType}`,
      );
      await this.eventBus.publish(rejectedEvent);
      throw new ManuscriptParseError(`Unsupported mimeType: ${mimeType}`);
    }

    // Parse do conteúdo.
    let estrutura;
    try {
      estrutura = await this.parser.parse(fileBuffer, mimeType);
    } catch (err) {
      const reason = err instanceof ManuscriptParseError
        ? err.reason
        : String(err);
      await this.eventBus.publish(
        new ManuscriptImportRejectedEvent(filename, empresaId, reason),
      );
      throw err;
    }

    // Armazenamento do arquivo (RULE-07: empresaId requerido).
    const manuscritoId = crypto.randomUUID();
    const storageKey = await this.fileStorage.store(
      fileBuffer,
      filename,
      mimeType,
      empresaId,
      manuscritoId,
    );

    // Criação do agregado Manuscrito.
    // tamanhoBytes populado com o tamanho real do buffer (constraint DB: > 0 e <= 52428800).
    const manuscrito = Manuscrito.create({
      id: manuscritoId,
      projetoId,
      empresaId,
      filename,
      mimeType: mimeType as ManuscritoMimeType,
      storageKey,
      estrutura,
      tamanhoBytes: BigInt(fileBuffer.length),
    });

    // Persistência (RULE-07: empresaId explícito).
    const saved = await this.manuscritoRepo.save(manuscrito, empresaId);

    // Binding ao ProjetoEditorial (IMP-INT-001).
    const titulo = filename.replace(/\.[^.]+$/, '');
    await resolveProjectBinding(this.createProjeto, {
      manuscritoId: saved.id,
      titulo,
      empresaId,
    });

    // Emissão de evento de domínio (IMP-INT-003).
    await this.eventBus.publish(
      new ManuscriptImportedEvent(saved.id, projetoId, empresaId, filename),
    );

    this.logger.log(
      `Manuscrito '${saved.id}' importado com sucesso — empresa=${empresaId}`,
    );

    return this.toDto(saved);
  }

  private toDto(manuscrito: Manuscrito): ManuscritoDetailDto {
    const dto = new ManuscritoDetailDto();
    dto.id = manuscrito.id;
    dto.projetoId = manuscrito.projetoId;
    dto.empresaId = manuscrito.empresaId;
    dto.filename = manuscrito.filename;
    dto.mimeType = manuscrito.mimeType;
    dto.status = manuscrito.status;
    dto.createdAt = manuscrito.createdAt;
    return dto;
  }
}
