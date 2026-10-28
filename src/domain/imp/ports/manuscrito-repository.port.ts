import type { Manuscrito } from '../manuscrito.entity';

/**
 * Resultado de sumário por projeto (para o endpoint de lote do proj-service).
 *
 * Tipo puro de domínio — sem decoradores Nest nem imports Prisma (RULE-01/02).
 */
export interface ManuscritoSummaryRecord {
  projetoId: string;
  totalCapitulos: number;
  totalImagens: number;
}

/**
 * Port de repositório para o agregado Manuscrito.
 *
 * Interface pura de domínio; sem decoradores Nest nem imports Prisma (RULE-01/02).
 * Implementada em infrastructure/persistence/ (RULE-04/05).
 */
export interface ManuscritoRepositoryPort {
  /**
   * Persiste um novo Manuscrito (INSERT-only — sem UPDATE/UPSERT).
   * @param manuscrito Agregado a persistir
   * @param empresaId  Slug do schema (multi-empresa)
   */
  save(manuscrito: Manuscrito, empresaId: string): Promise<Manuscrito>;

  /**
   * Carrega um Manuscrito pelo id dentro da empresa.
   * Retorna `null` se não encontrado ou pertencer a outra empresa.
   */
  findById(id: string, empresaId: string): Promise<Manuscrito | null>;

  /**
   * Lista manuscritos de um projeto dentro da empresa.
   */
  findByProjetoId(projetoId: string, empresaId: string): Promise<Manuscrito[]>;

  /**
   * Remove todos os manuscritos de um projeto dentro da empresa (cascade delete).
   * Usado pelo handler do evento ProjetoDeleted — chamado APÓS purgar os binários
   * via FileStoragePort.
   */
  deleteByProjetoId(projetoId: string, empresaId: string): Promise<void>;

  /**
   * Retorna o sumário do manuscrito mais recente de cada projetoId solicitado.
   * Projetos sem manuscrito são omitidos do resultado.
   *
   * Query em lote — um único findMany com `projetoId: { in: projetoIds }`.
   * Consumido pelo proj-service via `POST /api/imp/manuscripts/summaries`.
   */
  findSummariesByProjetoIds(projetoIds: string[], empresaId: string): Promise<ManuscritoSummaryRecord[]>;
}

/** Token de DI para o repositório de Manuscrito. */
export const MANUSCRITO_REPOSITORY_PORT = 'MANUSCRITO_REPOSITORY_PORT';
