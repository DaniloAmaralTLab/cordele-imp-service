/**
 * Port de armazenamento de arquivos.
 *
 * Interface pura de domínio; sem decoradores Nest nem imports Prisma.
 * Implementada em infrastructure/storage/.
 */
export interface FileStoragePort {
  /**
   * Armazena um arquivo e retorna a chave de armazenamento.
   * Path: `emp_{slug}/{manuscritoId}/{filename}`.
   */
  store(
    buffer: Buffer,
    filename: string,
    mimeType: string,
    empresaId: string,
    manuscritoId: string,
  ): Promise<string>;

  /**
   * Recupera o conteúdo de um arquivo pela chave de armazenamento.
   */
  retrieve(storageKey: string): Promise<Buffer>;

  /**
   * Remove um arquivo pelo storageKey.
   */
  delete(storageKey: string): Promise<void>;
}

/** Token de DI para o port de armazenamento de arquivos. */
export const FILE_STORAGE_PORT = 'FILE_STORAGE_PORT';
