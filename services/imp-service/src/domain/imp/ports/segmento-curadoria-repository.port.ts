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
}

/** Token de DI para SegmentoCuradoriaRepositoryPort. */
export const SEGMENTO_CURADORIA_REPOSITORY_PORT =
  'SEGMENTO_CURADORIA_REPOSITORY_PORT';
