/**
 * Erros de domínio do módulo IMP.
 *
 * Classes puras sem decoradores Nest nem imports externos (RULE-01/02).
 * Mapeados para HTTP status codes nas camadas de controller/filter de exceção.
 */

/** Lançado quando o segmento requisitado não pertence ao manuscrito informado. */
export class SegmentoNaoEncontradoError extends Error {
  constructor(segmentoId: string, manuscritoId: string) {
    super(
      `Segmento '${segmentoId}' não pertence ao manuscrito '${manuscritoId}'.`,
    );
    this.name = 'SegmentoNaoEncontradoError';
  }
}

/** Lançado quando o manuscrito não é encontrado ou não pertence à empresa. */
export class ManuscritoNaoEncontradoError extends Error {
  constructor(id: string) {
    super(`Manuscrito '${id}' não encontrado.`);
    this.name = 'ManuscritoNaoEncontradoError';
  }
}

/** Lançado quando a integração com o módulo PROJ falha. */
export class ProjetoIntegrationError extends Error {
  readonly originalCause?: unknown;

  constructor(message: string, originalCause?: unknown) {
    super(`Falha na integração com PROJ: ${message}`);
    this.name = 'ProjetoIntegrationError';
    this.originalCause = originalCause;
  }
}
