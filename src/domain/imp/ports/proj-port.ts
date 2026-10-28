/**
 * Ports para integração com o módulo PROJ (Projetos Editoriais).
 *
 * Interfaces puras de domínio; sem decoradores Nest nem imports Prisma.
 * Implementadas em infrastructure/proj/ como stubs até o PROJ service estar disponível.
 */

// ─── CreateProjetoEditorial ────────────────────────────────────────────────

export interface CreateProjetoEditorialInput {
  /** ID do manuscrito recém-importado que origina o projeto. */
  readonly manuscritoId: string;
  /** Título do projeto (derivado do filename do manuscrito). */
  readonly titulo: string;
  /** Slug da empresa (multi-empresa). */
  readonly empresaId: string;
  /**
   * Bearer token do usuário que originou a requisição.
   * Propagado para o PROJ service (padrão estabelecido por ImpManuscriptContentAdapter).
   * Opcional para compatibilidade retroativa com stubs/testes.
   */
  readonly bearerToken?: string;
}

export interface CreateProjetoEditorialOutput {
  readonly projetoId: string;
}

/**
 * Port para criação de um ProjetoEditorial no módulo PROJ
 * a partir de um Manuscrito recém-importado.
 */
export interface CreateProjetoEditorialPort {
  create(
    input: CreateProjetoEditorialInput,
  ): Promise<CreateProjetoEditorialOutput>;
}

/** Token de DI para CreateProjetoEditorialPort. */
export const CREATE_PROJETO_EDITORIAL_PORT = 'CREATE_PROJETO_EDITORIAL_PORT';

// ─── AdvanceProjetoStatus ──────────────────────────────────────────────────

export interface AdvanceProjetoStatusInput {
  /** ID do projeto editorial a avançar. */
  readonly projetoId: string;
  /** Status alvo no fluxo editorial (ex.: 'COMPOSICAO'). */
  readonly targetStatus: string;
  /** Slug da empresa (multi-empresa). */
  readonly empresaId: string;
  /**
   * Bearer token do usuário que originou a requisição.
   * Propagado para o PROJ service.
   * Opcional para compatibilidade retroativa com stubs/testes.
   */
  readonly bearerToken?: string;
}

/**
 * Port para avançar o status de um ProjetoEditorial no módulo PROJ
 * após confirmação de estrutura.
 */
export interface AdvanceProjetoStatusPort {
  advance(input: AdvanceProjetoStatusInput): Promise<void>;
}

/** Token de DI para AdvanceProjetoStatusPort. */
export const ADVANCE_PROJETO_STATUS_PORT = 'ADVANCE_PROJETO_STATUS_PORT';
