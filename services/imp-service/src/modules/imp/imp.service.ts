import {
  Inject,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';

import type { AuthenticatedUser } from '../../domain/auth/authenticated-user';
import {
  ManuscritoNaoEncontradoError,
  ProjetoIntegrationError,
  SegmentoNaoEncontradoError,
} from '../../domain/imp/errors';
import type { Manuscrito } from '../../domain/imp/manuscrito.entity';
import type { ManuscritoRepositoryPort } from '../../domain/imp/ports/manuscrito-repository.port';
import { MANUSCRITO_REPOSITORY_PORT } from '../../domain/imp/ports/manuscrito-repository.port';
import { EstruturaDto } from './dto/estrutura.dto';
import type { IgnoreSegmentoDto } from './dto/ignore-segmento.dto';
import { ManuscritoDetailDto } from './dto/manuscrito-detail.dto';
import type { UploadManuscritoDto } from './dto/upload-manuscrito.dto';
import {
  CONFIRM_ESTRUTURA_USE_CASE,
  IGNORE_SEGMENT_USE_CASE,
  IMPORT_MANUSCRIPT_USE_CASE,
} from './imp.tokens';
import type { ConfirmEstruturaUseCase } from './use-cases/confirm-estrutura.use-case';
import type { IgnoreSegmentUseCase } from './use-cases/ignore-segment.use-case';
import type { ImportManuscriptUseCase } from './use-cases/import-manuscript.use-case';

/**
 * Application service facade para IMP (Importação) — P2.
 *
 * Delega para os use cases reais; mapeia erros de domínio para exceções NestJS.
 * Não importa nada de infrastructure/ (RULE-04).
 * Não importa @prisma/client (RULE-01).
 * empresaId requerido antes de qualquer repositório (RULE-07).
 */
@Injectable()
export class ImpService {
  private readonly logger = new Logger(ImpService.name);

  constructor(
    @Inject(IMPORT_MANUSCRIPT_USE_CASE)
    private readonly importUseCase: ImportManuscriptUseCase,

    @Inject(IGNORE_SEGMENT_USE_CASE)
    private readonly ignoreSegmentUseCase: IgnoreSegmentUseCase,

    @Inject(CONFIRM_ESTRUTURA_USE_CASE)
    private readonly confirmEstruturaUseCase: ConfirmEstruturaUseCase,

    @Inject(MANUSCRITO_REPOSITORY_PORT)
    private readonly manuscritoRepo: ManuscritoRepositoryPort,
  ) {}

  async importManuscrito(
    dto: UploadManuscritoDto,
    user: AuthenticatedUser,
  ): Promise<ManuscritoDetailDto> {
    this.logger.log(
      `importManuscrito — projetoId=${dto.projetoId} empresa=${user.empresaId}`,
    );
    try {
      return await this.importUseCase.execute({
        projetoId: dto.projetoId,
        filename: dto.filename,
        // mimeType e fileBuffer serão resolvidos pelo interceptor multipart em P5+.
        mimeType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        fileBuffer: Buffer.alloc(0),
        empresaId: user.empresaId,
      });
    } catch (err) {
      if (err instanceof ProjetoIntegrationError) {
        throw new UnprocessableEntityException(err.message);
      }
      throw err;
    }
  }

  async getManuscrito(
    id: string,
    user: AuthenticatedUser,
  ): Promise<ManuscritoDetailDto> {
    const ms = await this.manuscritoRepo.findById(id, user.empresaId);
    if (!ms) {
      throw new UnprocessableEntityException(
        new ManuscritoNaoEncontradoError(id).message,
      );
    }
    return this.toDetailDto(ms);
  }

  async getEstrutura(
    id: string,
    user: AuthenticatedUser,
  ): Promise<EstruturaDto> {
    const ms = await this.manuscritoRepo.findById(id, user.empresaId);
    if (!ms) {
      throw new UnprocessableEntityException(
        new ManuscritoNaoEncontradoError(id).message,
      );
    }
    const dto = new EstruturaDto();
    dto.manuscritoId = ms.id;
    dto.estrutura = ms.estrutura as unknown as Record<string, unknown>;
    return dto;
  }

  async listManuscritosByProjeto(
    projetoId: string,
    user: AuthenticatedUser,
  ): Promise<ManuscritoDetailDto[]> {
    const list = await this.manuscritoRepo.findByProjetoId(
      projetoId,
      user.empresaId,
    );
    return list.map((ms) => this.toDetailDto(ms));
  }

  async ignoreSegmento(
    manuscritoId: string,
    segId: string,
    dto: IgnoreSegmentoDto,
    user: AuthenticatedUser,
  ): Promise<void> {
    try {
      await this.ignoreSegmentUseCase.ignore({
        manuscritoId,
        segmentoId: segId,
        motivo: dto.motivo,
        empresaId: user.empresaId,
      });
    } catch (err) {
      if (
        err instanceof SegmentoNaoEncontradoError ||
        err instanceof ManuscritoNaoEncontradoError
      ) {
        throw new UnprocessableEntityException(err.message);
      }
      throw err;
    }
  }

  async restoreSegmento(
    manuscritoId: string,
    segId: string,
    user: AuthenticatedUser,
  ): Promise<void> {
    try {
      await this.ignoreSegmentUseCase.restore({
        manuscritoId,
        segmentoId: segId,
        empresaId: user.empresaId,
      });
    } catch (err) {
      if (
        err instanceof SegmentoNaoEncontradoError ||
        err instanceof ManuscritoNaoEncontradoError
      ) {
        throw new UnprocessableEntityException(err.message);
      }
      throw err;
    }
  }

  async confirmEstrutura(
    manuscritoId: string,
    user: AuthenticatedUser,
  ): Promise<void> {
    try {
      await this.confirmEstruturaUseCase.execute({
        manuscritoId,
        empresaId: user.empresaId,
      });
    } catch (err) {
      if (
        err instanceof ManuscritoNaoEncontradoError ||
        err instanceof ProjetoIntegrationError
      ) {
        throw new UnprocessableEntityException(err.message);
      }
      throw err;
    }
  }

  private toDetailDto(ms: Manuscrito): ManuscritoDetailDto {
    const dto = new ManuscritoDetailDto();
    dto.id = ms.id;
    dto.projetoId = ms.projetoId;
    dto.empresaId = ms.empresaId;
    dto.filename = ms.filename;
    dto.mimeType = ms.mimeType;
    dto.status = ms.status;
    dto.createdAt = ms.createdAt;
    return dto;
  }
}
