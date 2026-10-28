import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
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
import { IgnoredSegmentsDto } from './dto/ignored-segments.dto';
import { ManuscritoDetailDto } from './dto/manuscrito-detail.dto';
import { ManuscritoSummaryItemDto } from './dto/manuscrito-summary-item.dto';
import type { UploadManuscritoDto } from './dto/upload-manuscrito.dto';
import {
  CONFIRM_ESTRUTURA_USE_CASE,
  GET_MANUSCRITO_SUMMARIES_USE_CASE,
  IGNORE_SEGMENT_USE_CASE,
  IMPORT_MANUSCRIPT_USE_CASE,
} from './imp.tokens';
import type { ConfirmEstruturaUseCase } from './use-cases/confirm-estrutura.use-case';
import type { GetManuscritoSummariesUseCase } from './use-cases/get-manuscrito-summaries.use-case';
import type { IgnoreSegmentUseCase } from './use-cases/ignore-segment.use-case';
import type { ImportManuscriptUseCase } from './use-cases/import-manuscript.use-case';

/**
 * Application service facade para IMP (Importação).
 *
 * Delega para os use cases reais; mapeia erros de domínio para exceções NestJS.
 * Não importa nada de infrastructure/ nem @prisma/client.
 * empresaId requerido antes de qualquer repositório.
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

    @Inject(GET_MANUSCRITO_SUMMARIES_USE_CASE)
    private readonly getManuscritoSummariesUseCase: GetManuscritoSummariesUseCase,

    @Inject(MANUSCRITO_REPOSITORY_PORT)
    private readonly manuscritoRepo: ManuscritoRepositoryPort,
  ) {}

  async importManuscrito(
    dto: UploadManuscritoDto,
    user: AuthenticatedUser,
    file: Express.Multer.File,
    bearerToken?: string,
  ): Promise<ManuscritoDetailDto> {
    this.logger.log(
      `importManuscrito — projetoId=${dto.projetoId ?? 'n/a'} projetoTitulo=${dto.projetoTitulo ?? 'n/a'} empresa=${user.empresaId}`,
    );
    // Domain errors (FormatoNaoSuportadoError, ArquivoGrandeDemaisError,
    // ProjectBindingInvalidError, ProjetoNaoEncontradoError, ManuscriptParseError)
    // são lançados diretamente para o ProblemDetailFilter capturar (APP_FILTER).
    return this.importUseCase.execute({
      projetoId: dto.projetoId,
      projetoTitulo: dto.projetoTitulo,
      filename: file.originalname,
      mimeType: file.mimetype,
      fileBuffer: file.buffer,
      empresaId: user.empresaId,
      bearerToken,
    });
  }

  async getManuscrito(
    id: string,
    user: AuthenticatedUser,
  ): Promise<ManuscritoDetailDto> {
    const ms = await this.manuscritoRepo.findById(id, user.empresaId);
    if (!ms) {
      // 404 Not Found — manuscript does not exist within the active empresa
      // (cross-empresa access is indistinguishable from absent without cross-schema lookup,
      // but 404 is the correct REST response in both cases).
      throw new NotFoundException(new ManuscritoNaoEncontradoError(id).message);
    }
    return this.toDetailDto(ms);
  }

  async getEstrutura(
    id: string,
    user: AuthenticatedUser,
  ): Promise<EstruturaDto> {
    const ms = await this.manuscritoRepo.findById(id, user.empresaId);
    if (!ms) {
      throw new NotFoundException(new ManuscritoNaoEncontradoError(id).message);
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
    // Sort by createdAt descending — newest manuscript first
    const sorted = [...list].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
    return sorted.map((ms) => this.toDetailDto(ms));
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

  async listSegmentosIgnorados(
    manuscritoId: string,
    user: AuthenticatedUser,
  ): Promise<IgnoredSegmentsDto> {
    try {
      const ignoredSegmentoIds = await this.ignoreSegmentUseCase.listIgnorados(
        manuscritoId,
        user.empresaId,
      );
      const dto = new IgnoredSegmentsDto();
      dto.manuscritoId = manuscritoId;
      dto.ignoredSegmentoIds = ignoredSegmentoIds;
      return dto;
    } catch (err) {
      if (err instanceof ManuscritoNaoEncontradoError) {
        throw new NotFoundException(err.message);
      }
      throw err;
    }
  }

  async confirmEstrutura(
    manuscritoId: string,
    user: AuthenticatedUser,
    bearerToken?: string,
  ): Promise<void> {
    try {
      await this.confirmEstruturaUseCase.execute({
        manuscritoId,
        empresaId: user.empresaId,
        bearerToken,
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

  async getManuscritoSummaries(
    projetoIds: string[],
    user: AuthenticatedUser,
  ): Promise<ManuscritoSummaryItemDto[]> {
    this.logger.log(
      `getManuscritoSummaries — n=${projetoIds.length} empresa=${user.empresaId}`,
    );
    const records = await this.getManuscritoSummariesUseCase.execute({
      projetoIds,
      empresaId: user.empresaId,
    });
    return records.map((r) => {
      const dto = new ManuscritoSummaryItemDto();
      dto.projetoId = r.projetoId;
      dto.totalCapitulos = r.totalCapitulos;
      dto.totalImagens = r.totalImagens;
      return dto;
    });
  }

  private toDetailDto(ms: Manuscrito): ManuscritoDetailDto {
    const dto = new ManuscritoDetailDto();
    dto.id = ms.id;
    dto.projetoId = ms.projetoId;
    dto.empresaId = ms.empresaId;
    dto.filename = ms.filename;
    dto.mimeType = ms.mimeType;
    dto.status = ms.status;
    dto.estrutura = ms.estrutura;
    dto.totalCapitulos = ms.estrutura?.chapters?.length ?? 0;
    dto.totalImagens = this.countImages(ms);
    dto.trechosNaoParseados = this.countUnparsed(ms);
    dto.createdAt = ms.createdAt;
    return dto;
  }

  private countImages(ms: Manuscrito): number {
    let count = 0;
    for (const chapter of ms.estrutura?.chapters ?? []) {
      for (const section of chapter.sections) {
        count += section.blocks.filter((b) => b.type === 'image').length;
      }
    }
    return count;
  }

  private countUnparsed(ms: Manuscrito): number {
    let count = 0;
    for (const chapter of ms.estrutura?.chapters ?? []) {
      for (const section of chapter.sections) {
        count += section.unparsedSegments.length;
      }
    }
    count += ms.estrutura?.orphanUnparsedSegments?.length ?? 0;
    return count;
  }
}
