import { Inject, Injectable, Logger } from '@nestjs/common';

import type { ManuscritoRepositoryPort } from '../../../domain/imp/ports/manuscrito-repository.port';
import { MANUSCRITO_REPOSITORY_PORT } from '../../../domain/imp/ports/manuscrito-repository.port';
import type { SegmentoCuradoriaRepositoryPort } from '../../../domain/imp/ports/segmento-curadoria-repository.port';
import { SEGMENTO_CURADORIA_REPOSITORY_PORT } from '../../../domain/imp/ports/segmento-curadoria-repository.port';
import {
  ManuscritoNaoEncontradoError,
  SegmentoNaoEncontradoError,
} from '../../../domain/imp/errors';
import { SegmentoCuradoria } from '../../../domain/imp/segmento-curadoria.entity';

export interface IgnoreSegmentCommand {
  readonly manuscritoId: string;
  readonly segmentoId: string;
  readonly motivo?: string;
  /** Slug da empresa — requerido antes do primeiro acesso ao repositório (RULE-07). */
  readonly empresaId: string;
}

export interface RestoreSegmentCommand {
  readonly manuscritoId: string;
  readonly segmentoId: string;
  /** Slug da empresa. */
  readonly empresaId: string;
}

/**
 * Use case: IgnoreSegmentUseCase (IMP-007).
 *
 * Valida que o segmentoId pertence ao manuscrito e persiste SegmentoCuradoria.
 * Idempotente: ignores repetidos sobrescrevem o registro anterior com IGNORADO.
 * Restauração: POST seguido de DELETE resulta em status ATIVO.
 *
 * Não importa @prisma/client nem infrastructure/ (RULE-01/02/04).
 * empresaId requerido antes de qualquer acesso ao repositório (RULE-07).
 */
@Injectable()
export class IgnoreSegmentUseCase {
  private readonly logger = new Logger(IgnoreSegmentUseCase.name);

  constructor(
    @Inject(MANUSCRITO_REPOSITORY_PORT)
    private readonly manuscritoRepo: ManuscritoRepositoryPort,

    @Inject(SEGMENTO_CURADORIA_REPOSITORY_PORT)
    private readonly segmentoCuradoriaRepo: SegmentoCuradoriaRepositoryPort,
  ) {}

  /**
   * Marca um segmento como IGNORADO.
   * Lança SegmentoNaoEncontradoError se o segmentoId não pertence ao manuscrito.
   */
  async ignore(command: IgnoreSegmentCommand): Promise<void> {
    const { manuscritoId, segmentoId, motivo, empresaId } = command;

    // RULE-07: empresaId requerido antes do primeiro repositório.
    const manuscrito = await this.manuscritoRepo.findById(manuscritoId, empresaId);
    if (!manuscrito) {
      throw new ManuscritoNaoEncontradoError(manuscritoId);
    }

    if (!manuscrito.hasSegmento(segmentoId)) {
      throw new SegmentoNaoEncontradoError(segmentoId, manuscritoId);
    }

    const curadoria = SegmentoCuradoria.ignore(manuscritoId, segmentoId, motivo);
    await this.segmentoCuradoriaRepo.save(curadoria, empresaId);

    this.logger.log(
      `Segmento '${segmentoId}' ignorado no manuscrito '${manuscritoId}' — empresa=${empresaId}`,
    );
  }

  /**
   * Restaura um segmento para status ATIVO (desfaz ignore).
   * Idempotente: restaurar um segmento já ATIVO não lança exceção.
   *
   * A tabela `segmento_curadoria` só admite `acao='ignorado'` (CHECK constraint —
   * ver migration `20260824160028_init`); ATIVO é representado pela AUSÊNCIA do
   * registro, não por um valor de `acao`. Restaurar remove o registro em vez de
   * fazer upsert (upsert com status ATIVO seria silenciosamente coagido de volta
   * para 'ignorado' pelo mapper, deixando o segmento marcado como ignorado para sempre).
   */
  async restore(command: RestoreSegmentCommand): Promise<void> {
    const { manuscritoId, segmentoId, empresaId } = command;

    const manuscrito = await this.manuscritoRepo.findById(manuscritoId, empresaId);
    if (!manuscrito) {
      throw new ManuscritoNaoEncontradoError(manuscritoId);
    }

    if (!manuscrito.hasSegmento(segmentoId)) {
      throw new SegmentoNaoEncontradoError(segmentoId, manuscritoId);
    }

    await this.segmentoCuradoriaRepo.deleteByManuscritoAndSegmento(
      manuscritoId,
      segmentoId,
      empresaId,
    );

    this.logger.log(
      `Segmento '${segmentoId}' restaurado no manuscrito '${manuscritoId}' — empresa=${empresaId}`,
    );
  }

  /**
   * Lista os ids dos segmentos atualmente IGNORADOS de um manuscrito.
   */
  async listIgnorados(
    manuscritoId: string,
    empresaId: string,
  ): Promise<string[]> {
    const manuscrito = await this.manuscritoRepo.findById(manuscritoId, empresaId);
    if (!manuscrito) {
      throw new ManuscritoNaoEncontradoError(manuscritoId);
    }

    const registros = await this.segmentoCuradoriaRepo.findAllByManuscrito(
      manuscritoId,
      empresaId,
    );
    return registros.map((r) => r.segmentoId);
  }
}
