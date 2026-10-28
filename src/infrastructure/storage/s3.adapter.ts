import {
  DeleteObjectCommand,
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'node:stream';

import type { FileStoragePort } from '../../domain/imp/ports/file-storage.port';

/**
 * Adapter de FileStoragePort usando AWS SDK v3 (S3-compatible).
 *
 * Ativado quando `FILE_STORAGE_ADAPTER=s3` no ambiente.
 * Credenciais lidas via ConfigService — nunca hardcoded.
 *
 * Storage key: `emp_{empresaId}/{manuscritoId}/{filename}`
 *
 * Regras de implementação (RULE-01..09):
 *  - Nenhum import de @nestjs/* no domain (esta classe vive em infrastructure/).
 *  - ConfigService injetado via construtor (nunca property injection).
 *  - Sem console.log — usa Logger do Nest (RULE-08).
 */
@Injectable()
export class S3Adapter implements FileStoragePort {
  private readonly logger = new Logger(S3Adapter.name);
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(private readonly config: ConfigService) {
    const region = this.config.get<string>('S3_REGION', 'us-east-1');
    const accessKeyId = this.config.get<string>('S3_ACCESS_KEY', '');
    const secretAccessKey = this.config.get<string>('S3_SECRET_KEY', '');
    this.bucket = this.config.get<string>('S3_BUCKET', '');

    this.client = new S3Client({
      region,
      credentials:
        accessKeyId && secretAccessKey
          ? { accessKeyId, secretAccessKey }
          : undefined,
    });
  }

  /**
   * Armazena um arquivo no S3 e retorna a chave de armazenamento.
   * Path: `emp_{empresaId}/{manuscritoId}/{filename}` — escopo multi-empresa (RULE-07).
   */
  async store(
    buffer: Buffer,
    filename: string,
    mimeType: string,
    empresaId: string,
    manuscritoId: string,
  ): Promise<string> {
    const storageKey = `emp_${empresaId}/${manuscritoId}/${filename}`;

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
        Body: buffer,
        ContentType: mimeType,
        ContentLength: buffer.length,
      }),
    );

    this.logger.log(`S3 armazenado: ${storageKey}`);
    return storageKey;
  }

  /**
   * Recupera o conteúdo de um arquivo do S3 pela chave de armazenamento.
   * Streaming: converte o ReadableStream do SDK para Buffer sem alocar cópia intermediária.
   */
  async retrieve(storageKey: string): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
      }),
    );

    const stream = response.Body as Readable;
    return await S3Adapter.streamToBuffer(stream);
  }

  /**
   * Remove um arquivo do S3 pelo storageKey.
   * S3 DELETE é idempotente — 404 é silenciosamente ignorado.
   */
  async delete(storageKey: string): Promise<void> {
    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: storageKey,
        }),
      );
      this.logger.log(`S3 removido: ${storageKey}`);
    } catch (err) {
      if (err instanceof NoSuchKey) {
        // S3 DeleteObject é idempotente; chave ausente não é erro.
        return;
      }
      throw err;
    }
  }

  /** Converte um Readable stream em Buffer (helper interno). */
  private static streamToBuffer(stream: Readable): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }
}
