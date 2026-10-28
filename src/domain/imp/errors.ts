/**
 * Erros de domínio do módulo IMP.
 *
 * Classes puras sem decoradores Nest nem imports externos.
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

/** Lançado quando o formato do arquivo não é suportado (DOCX ou Markdown). → 415 */
export class FormatoNaoSuportadoError extends Error {
  constructor(format: string) {
    super(`Formato não suportado: '${format}'. Apenas DOCX e Markdown são aceitos.`);
    this.name = 'FormatoNaoSuportadoError';
  }
}

/** Lançado quando o arquivo excede o tamanho máximo de 50 MiB. → 413 */
export class ArquivoGrandeDemaisError extends Error {
  constructor(sizeBytes: number) {
    const sizeMB = (sizeBytes / (1024 * 1024)).toFixed(1);
    super(`O arquivo tem ${sizeMB} MB; o máximo é 50 MB.`);
    this.name = 'ArquivoGrandeDemaisError';
  }
}

/** Lançado quando projetoId não existe na empresa ativa. → 422 projeto-not-found */
export class ProjetoNaoEncontradoError extends Error {
  constructor(projetoId: string) {
    super(`Projeto '${projetoId}' não encontrado na empresa ativa.`);
    this.name = 'ProjetoNaoEncontradoError';
  }
}

/** Lançado quando o project binding é inválido (nenhum ou ambos os campos fornecidos). → 400 */
export class ProjectBindingInvalidError extends Error {
  constructor(reason: 'both' | 'none') {
    super(
      reason === 'both'
        ? 'Forneça apenas um de projetoId ou projetoTitulo, não ambos.'
        : 'Forneça projetoId (projeto existente) ou projetoTitulo (criar projeto).',
    );
    this.name = 'ProjectBindingInvalidError';
  }
}
