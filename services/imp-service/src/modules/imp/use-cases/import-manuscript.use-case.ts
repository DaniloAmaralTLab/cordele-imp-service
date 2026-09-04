import { randomUUID } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';

import {
  ArquivoGrandeDemaisError,
  FormatoNaoSuportadoError,
  ProjectBindingInvalidError,
  ProjetoNaoEncontradoError,
} from '../../../domain/imp/errors';
import type { IEventBus } from '../../../domain/imp/ports/event-bus.port';
import { EVENT_BUS_PORT } from '../../../domain/imp/ports/event-bus.port';
import type { FileStoragePort } from '../../../domain/imp/ports/file-storage.port';
import { FILE_STORAGE_PORT } from '../../../domain/imp/ports/file-storage.port';
import type { FindProjetoPort } from '../../../domain/imp/ports/find-projeto.port';
import { FIND_PROJETO_PORT } from '../../../domain/imp/ports/find-projeto.port';
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

/** Tamanho máximo do arquivo: 50 MiB (52 428 800 bytes) — api-contract.md §4.1 */
const MAX_FILE_SIZE_BYTES = 52_428_800;

/** Extensões e MIME types aceitos pelo import. */
const SUPPORTED_EXTENSIONS = new Set(['docx', 'md']);
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const MARKDOWN_MIME = 'text/markdown';

export interface ImportManuscriptCommand {
  readonly filename: string;
  readonly mimeType: string;
  readonly fileBuffer: Buffer;
  /** Exatamente um dos dois deve ser fornecido (D-C). */
  readonly projetoId?: string;
  readonly projetoTitulo?: string;
  /** Slug da empresa — requerido para isolamento multi-empresa (RULE-07). */
  readonly empresaId: string;
  /**
   * Bearer token do usuário que originou a requisição HTTP.
   * Propagado para os ports PROJ (createProjeto / findProjeto) para autenticar
   * as chamadas HTTP ao proj-service sob o mesmo principal do usuário.
   * Opcional para compatibilidade com testes unitários que não precisam de auth.
   */
  readonly bearerToken?: string;
}

/**
 * Use case: ImportManuscriptUseCase (IMP-004 + IMP-005 + IMP-006 + D-A + D-C).
 *
 * Orquestra: validação de tamanho → validação de formato → project binding →
 * parse → armazenamento → criação do agregado → persistência → emissão de evento.
 *
 * Validações EARS:
 * - IF file > 50 MB → ArquivoGrandeDemaisError (413)
 * - IF formato inválido → FormatoNaoSuportadoError (415)
 * - IF nenhum ou ambos projetoId/projetoTitulo → ProjectBindingInvalidError (400)
 * - IF projetoId não existe na empresa ativa → ProjetoNaoEncontradoError (422)
 * - IF parse irrecuperável → ManuscriptParseError (422)
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

    @Inject(FIND_PROJETO_PORT)
    private readonly findProjeto: FindProjetoPort,

    @Inject(EVENT_BUS_PORT)
    private readonly eventBus: IEventBus,
  ) {}

  async execute(command: ImportManuscriptCommand): Promise<ManuscritoDetailDto> {
    const { filename, fileBuffer, empresaId, projetoId, projetoTitulo, bearerToken } = command;

    // ── 1. Validação de tamanho (413) — antes de qualquer I/O ────────────────
    if (fileBuffer.length > MAX_FILE_SIZE_BYTES) {
      throw new ArquivoGrandeDemaisError(fileBuffer.length);
    }

    // ── 2. Validação de formato (415) — baseada na extensão do arquivo ───────
    const resolvedMime = this.resolveMimeType(filename);
    if (!resolvedMime) {
      throw new FormatoNaoSuportadoError(filename);
    }

    // ── 3. Validação de project binding (400) — D-C ───────────────────────────
    if (!projetoId && !projetoTitulo) {
      throw new ProjectBindingInvalidError('none');
    }
    if (projetoId && projetoTitulo) {
      throw new ProjectBindingInvalidError('both');
    }

    // ── 4. Resolução do projetoId ─────────────────────────────────────────────
    let resolvedProjetoId: string;

    if (projetoId) {
      // Valida que o projeto existe na empresa ativa (422 se não existir).
      const found = await this.findProjeto.findById(projetoId, empresaId, bearerToken);
      if (!found) {
        throw new ProjetoNaoEncontradoError(projetoId);
      }
      resolvedProjetoId = found.projetoId;
    } else {
      // projetoTitulo: cria o projeto via PROJ port antes do parse.
      const manuscritoId = randomUUID();
      const created = await this.createProjeto.create({
        manuscritoId,
        titulo: projetoTitulo!,
        empresaId,
        bearerToken,
      });
      resolvedProjetoId = created.projetoId;
      // Continuar com o manuscritoId pré-alocado para manter a consistência.
      return this.runImport(command, resolvedMime, resolvedProjetoId, manuscritoId);
    }

    return this.runImport(command, resolvedMime, resolvedProjetoId);
  }

  private async runImport(
    command: ImportManuscriptCommand,
    mimeType: string,
    projetoId: string,
    preallocatedId?: string,
  ): Promise<ManuscritoDetailDto> {
    const { filename, fileBuffer, empresaId } = command;

    // ── 5. Parse do conteúdo ──────────────────────────────────────────────────
    let estrutura;
    try {
      estrutura = await this.parser.parse(fileBuffer, mimeType);
    } catch (err) {
      const reason = err instanceof ManuscriptParseError ? err.reason : String(err);
      await this.eventBus.publish(
        new ManuscriptImportRejectedEvent(filename, empresaId, reason),
      );
      // Re-throw como ManuscriptParseError para o filtro capturar.
      if (err instanceof ManuscriptParseError) throw err;
      throw new ManuscriptParseError(String(err), err);
    }

    // ── 6. Armazenamento do arquivo (RULE-07: empresaId requerido) ────────────
    const manuscritoId = preallocatedId ?? randomUUID();
    const storageKey = await this.fileStorage.store(
      fileBuffer,
      filename,
      mimeType,
      empresaId,
      manuscritoId,
    );

    // ── 7. Criação do agregado Manuscrito ─────────────────────────────────────
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

    // ── 8. Persistência (RULE-07: empresaId explícito) ────────────────────────
    const saved = await this.manuscritoRepo.save(manuscrito, empresaId);

    // ── 9. Emissão de evento de domínio (IMP-INT-003) ─────────────────────────
    await this.eventBus.publish(
      new ManuscriptImportedEvent(saved.id, projetoId, empresaId, filename),
    );

    this.logger.log(
      `Manuscrito '${saved.id}' importado — empresa=${empresaId} projeto=${projetoId}`,
    );

    return this.toDto(saved);
  }

  /**
   * Resolve o MIME type a partir da extensão do arquivo.
   * Retorna null se o formato não for suportado.
   * Não confia no Content-Type do cliente (pode ser falsificado).
   */
  private resolveMimeType(filename: string): string | null {
    const ext = filename.toLowerCase().split('.').pop() ?? '';
    if (!SUPPORTED_EXTENSIONS.has(ext)) return null;
    if (ext === 'docx') return DOCX_MIME;
    if (ext === 'md') return MARKDOWN_MIME;
    return null;
  }

  private toDto(manuscrito: Manuscrito): ManuscritoDetailDto {
    const dto = new ManuscritoDetailDto();
    dto.id = manuscrito.id;
    dto.projetoId = manuscrito.projetoId;
    dto.empresaId = manuscrito.empresaId;
    dto.filename = manuscrito.filename;
    dto.mimeType = manuscrito.mimeType;
    dto.status = manuscrito.status;
    dto.estrutura = manuscrito.estrutura;
    dto.totalCapitulos = manuscrito.estrutura.chapters.length;
    dto.totalImagens = this.countImages(manuscrito.estrutura);
    dto.trechosNaoParseados = this.countUnparsed(manuscrito.estrutura);
    dto.createdAt = manuscrito.createdAt;
    return dto;
  }

  private countImages(estrutura: Manuscrito['estrutura']): number {
    let count = 0;
    for (const chapter of estrutura.chapters) {
      for (const section of chapter.sections) {
        count += section.blocks.filter((b) => b.type === 'image').length;
      }
    }
    return count;
  }

  private countUnparsed(estrutura: Manuscrito['estrutura']): number {
    let count = 0;
    for (const chapter of estrutura.chapters) {
      for (const section of chapter.sections) {
        count += section.unparsedSegments.length;
      }
    }
    count += estrutura.orphanUnparsedSegments.length;
    return count;
  }
}
