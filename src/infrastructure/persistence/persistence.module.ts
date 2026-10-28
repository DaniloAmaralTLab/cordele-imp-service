import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { FILE_STORAGE_PORT } from '../../domain/imp/ports/file-storage.port';
import type { FileStoragePort } from '../../domain/imp/ports/file-storage.port';
import { MANUSCRIPT_PARSER_PORT } from '../../domain/imp/ports/manuscript-parser.port';
import { MANUSCRITO_REPOSITORY_PORT } from '../../domain/imp/ports/manuscrito-repository.port';
import { SEGMENTO_CURADORIA_REPOSITORY_PORT } from '../../domain/imp/ports/segmento-curadoria-repository.port';
import { DocxParserAdapter } from '../parsers/docx-parser.adapter';
import { MarkdownParserAdapter } from '../parsers/markdown-parser.adapter';
import { ParserFactory } from '../parsers/parser.factory';
import { LocalDiskAdapter } from '../storage/local-disk.adapter';
import { S3Adapter } from '../storage/s3.adapter';
import { DatabaseModule } from './database.module';
import { PrismaManuscritoRepository } from './prisma-manuscrito.repository';
import { PrismaSegmentoCuradoriaRepository } from './prisma-segmento-curadoria.repository';
import { TenantPrismaFactory } from './tenant-prisma.factory';

/**
 * Módulo de persistência — global, exporta tokens de ports para todo o contexto da aplicação.
 *
 * Decorado com @Global() para que ImpModule não precise importá-lo diretamente (RULE-04).
 *
 * P3: substitui os bindings provisórios (useValue: null) pelos adapters Prisma reais:
 *   - MANUSCRITO_REPOSITORY_PORT → PrismaManuscritoRepository
 *   - SEGMENTO_CURADORIA_REPOSITORY_PORT → PrismaSegmentoCuradoriaRepository
 *
 * P4: substitui os bindings provisórios de parse e storage pelos adapters reais:
 *   - MANUSCRIPT_PARSER_PORT → ParserFactory (delega para DocxParserAdapter / MarkdownParserAdapter)
 *   - FILE_STORAGE_PORT → LocalDiskAdapter (default; substituível por S3Adapter via env flag)
 *
 * P8: seleciona o adapter de armazenamento via `FILE_STORAGE_ADAPTER`:
 *   - `local` (default) → LocalDiskAdapter  (dev/testes, sem dependência de nuvem)
 *   - `s3`             → S3Adapter          (produção; requer S3_BUCKET/REGION/ACCESS_KEY/SECRET_KEY)
 */
@Global()
@Module({
  imports: [DatabaseModule],
  providers: [
    TenantPrismaFactory,
    DocxParserAdapter,
    MarkdownParserAdapter,
    ParserFactory,
    LocalDiskAdapter,
    S3Adapter,
    {
      provide: MANUSCRITO_REPOSITORY_PORT,
      useClass: PrismaManuscritoRepository,
    },
    {
      provide: SEGMENTO_CURADORIA_REPOSITORY_PORT,
      useClass: PrismaSegmentoCuradoriaRepository,
    },
    {
      provide: FILE_STORAGE_PORT,
      inject: [ConfigService, LocalDiskAdapter, S3Adapter],
      useFactory: (
        config: ConfigService,
        local: LocalDiskAdapter,
        s3: S3Adapter,
      ): FileStoragePort => {
        const driver = config.get<string>('FILE_STORAGE_ADAPTER', 'local');
        return driver === 's3' ? s3 : local;
      },
    },
    {
      provide: MANUSCRIPT_PARSER_PORT,
      useClass: ParserFactory,
    },
  ],
  exports: [
    DatabaseModule,
    TenantPrismaFactory,
    MANUSCRITO_REPOSITORY_PORT,
    SEGMENTO_CURADORIA_REPOSITORY_PORT,
    FILE_STORAGE_PORT,
    MANUSCRIPT_PARSER_PORT,
  ],
})
export class PersistenceModule {}
