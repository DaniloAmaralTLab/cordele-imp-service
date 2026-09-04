/**
 * Port para consulta de ProjetoEditorial no módulo PROJ.
 *
 * Interface pura de domínio; sem decoradores Nest nem imports Prisma (RULE-01/02).
 * Usada pelo ImportManuscriptUseCase para verificar se um projetoId existe
 * na empresa ativa antes de vincular o manuscrito (D-C).
 */

export interface FindProjetoOutput {
  readonly projetoId: string;
}

export interface FindProjetoPort {
  /**
   * Procura um ProjetoEditorial pelo id dentro da empresa ativa.
   * Retorna null se não existir — nunca revela existência cross-tenant.
   *
   * @param projetoId  ID do projeto a procurar.
   * @param empresaId  Slug da empresa (multi-empresa).
   * @param bearerToken  Bearer token do usuário (propagado para o PROJ service).
   *                     Opcional para compatibilidade com stubs/testes.
   */
  findById(
    projetoId: string,
    empresaId: string,
    bearerToken?: string,
  ): Promise<FindProjetoOutput | null>;
}

/** Token de DI para FindProjetoPort. */
export const FIND_PROJETO_PORT = 'FIND_PROJETO_PORT';
