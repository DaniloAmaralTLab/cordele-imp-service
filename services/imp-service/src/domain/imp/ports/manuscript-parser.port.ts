import type { ContentTree } from '../content-tree';

/**
 * Port do parser de manuscritos.
 *
 * Interface pura de domínio; sem decoradores Nest nem imports Prisma (RULE-01/02).
 * Implementada em infrastructure/parsers/ (RULE-04/05).
 */
export interface ManuscriptParserPort {
  /**
   * Faz parse de um buffer de arquivo e retorna a ContentTree canônica.
   * Lança `ManuscriptParseError` se o arquivo estiver corrompido ou ilegível.
   */
  parse(buffer: Buffer, mimeType: string): Promise<ContentTree>;

  /**
   * Informa se este parser suporta o mimeType fornecido.
   */
  supports(mimeType: string): boolean;
}

/** Token de DI para o port do parser de manuscritos. */
export const MANUSCRIPT_PARSER_PORT = 'MANUSCRIPT_PARSER_PORT';

/** Erro lançado quando o arquivo não pode ser parseado. */
export class ManuscriptParseError extends Error {
  constructor(
    readonly reason: string,
    readonly originalError?: unknown,
  ) {
    super(`Manuscript parse failed: ${reason}`);
    this.name = 'ManuscriptParseError';
  }
}
