import type { SegmentoCuradoria } from '../segmento-curadoria.entity';

/**
 * Port de repositório para o agregado SegmentoCuradoria.
 *
 * Interface pura de domínio; sem decoradores Nest nem imports Prisma (RULE-01/02).
 * Implementada em infrastructure/persistence/ (P3).
 */
export interface SegmentoCuradoriaRepositoryPort {
  /**
   * Persiste ou atualiza um SegmentoCuradoria (upsert por manuscritoId + segmentoId).
   */
  save(
    segmento: SegmentoCuradoria,
    empresaId: string,
  ): Promise<SegmentoCuradoria>;

  /**
   * Busca a curadoria de um segmento específico dentro de um manuscrito.
   */
  findByManuscritoAndSegmento(
    manuscritoId: string,
    segmentoId: string,
    empresaId: string,
  ): Promise<SegmentoCuradoria | null>;

  /**
   * Lista todos os segmentos atualmente IGNORADOS de um manuscrito.
   * Presença de registro == ignorado (acao só admite 'ignorado' na constraint do DB).
   */
  findAllByManuscrito(
    manuscritoId: string,
    empresaId: string,
  ): Promise<SegmentoCuradoria[]>;

  /**
   * Remove o registro de curadoria de um segmento (restaura para ATIVO).
   * Idempotente: remover um segmento sem registro não lança erro.
   */
  deleteByManuscritoAndSegmento(
    manuscritoId: string,
    segmentoId: string,
    empresaId: string,
  ): Promise<void>;
}

/** Token de DI para SegmentoCuradoriaRepositoryPort. */
export const SEGMENTO_CURADORIA_REPOSITORY_PORT =
  'SEGMENTO_CURADORIA_REPOSITORY_PORT';
