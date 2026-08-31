/**
 * DI tokens do módulo IMP.
 *
 * Separados do ImpModule para evitar dependências circulares:
 * ImpService importa os tokens, ImpModule importa ImpService.
 */

/** Token de DI para o use case de importação de manuscrito. */
export const IMPORT_MANUSCRIPT_USE_CASE = 'IMPORT_MANUSCRIPT_USE_CASE';

/** Token de DI para o use case de ignorar/restaurar segmento. */
export const IGNORE_SEGMENT_USE_CASE = 'IGNORE_SEGMENT_USE_CASE';

/** Token de DI para o use case de confirmação de estrutura. */
export const CONFIRM_ESTRUTURA_USE_CASE = 'CONFIRM_ESTRUTURA_USE_CASE';

/** Token de DI para o use case de cascade delete de projeto. */
export const CASCADE_DELETE_PROJETO_USE_CASE = 'CASCADE_DELETE_PROJETO_USE_CASE';
