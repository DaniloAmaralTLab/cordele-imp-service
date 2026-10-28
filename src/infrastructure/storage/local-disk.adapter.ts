import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import type { FileStoragePort } from '../../domain/imp/ports/file-storage.port';

/**
 * Adapter de FileStoragePort que persiste arquivos no disco local.
 *
 * Apenas para uso em desenvolvimento/testes; em produção será substituído
 * pelo S3Adapter.
 *
 * Storage key: `emp_{empresaId}/{manuscritoId}/{filename}`
 * Base dir: env var `FILE_STORAGE_BASE_DIR` (default: `/tmp/cordele-files`)
 */
@Injectable()
export class LocalDiskAdapter implements FileStoragePort {
  private readonly logger = new Logger(LocalDiskAdapter.name);
  private readonly baseDir: string;

  constructor(private readonly config: ConfigService) {
    this.baseDir = this.config.get<string>(
      'FILE_STORAGE_BASE_DIR',
      '/tmp/cordele-files',
    );
  }

  async store(
    buffer: Buffer,
    filename: string,
    _mimeType: string,
    empresaId: string,
    manuscritoId: string,
  ): Promise<string> {
    // Escopado por empresa — isolamento multi-empresa.
    const storageKey = `emp_${empresaId}/${manuscritoId}/${filename}`;
    const fullPath = path.join(this.baseDir, storageKey);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, buffer);
    this.logger.log(`Arquivo armazenado: ${storageKey}`);
    return storageKey;
  }

  async retrieve(storageKey: string): Promise<Buffer> {
    const fullPath = path.join(this.baseDir, storageKey);
    const data = await fs.readFile(fullPath);
    return Buffer.from(data);
  }

  async delete(storageKey: string): Promise<void> {
    const fullPath = path.join(this.baseDir, storageKey);
    await fs.rm(fullPath, { force: true });
    this.logger.log(`Arquivo removido: ${storageKey}`);
  }
}
