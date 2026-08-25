import { Inject, Injectable, Logger } from '@nestjs/common';

import type { SegmentoCuradoria } from '../../domain/imp/segmento-curadoria.entity';
import type { SegmentoCuradoriaRepositoryPort } from '../../domain/imp/ports/segmento-curadoria-repository.port';
import { EmpresaContextService } from '../auth/empresa-context.service';
import { SegmentoCuradoriaMapper } from './segmento-curadoria.mapper';
import { TenantPrismaFactory } from './tenant-prisma.factory';

/**
 * PrismaSegmentoCuradoriaRepository — adapter de persistência para `SegmentoCuradoria`.
 *
 * Implementa `SegmentoCuradoriaRepositoryPort` usando Prisma + schema-per-tenant.
 *
 * RULE-07: `empresaId` requerido em todos os métodos para isolamento multi-empresa.
 *
 * `save()` faz upsert por `(manuscritoId, segmentoId)` — constraint UNIQUE na tabela.
 * O upsert atualiza `acao` se o registro já existir (idempotente por design).
 *
 * `criadoPor` derivado do `userId` do principal autenticado via `EmpresaContextService`
 * (P5: substituindo o placeholder `'system'` anterior).
 */
@Injectable()
export class PrismaSegmentoCuradoriaRepository
  implements SegmentoCuradoriaRepositoryPort
{
  private readonly logger = new Logger(PrismaSegmentoCuradoriaRepository.name);

  constructor(
    @Inject(TenantPrismaFactory)
    private readonly tenantFactory: TenantPrismaFactory,
    private readonly empresaContextService: EmpresaContextService,
  ) {}

  /**
   * Persiste ou atualiza um SegmentoCuradoria (upsert por manuscritoId + segmentoId).
   *
   * `criadoPor` é derivado do JWT via `EmpresaContextService`; fallback `'system'`
   * para invocações batch sem contexto HTTP (RULE-07).
   */
  async save(
    segmento: SegmentoCuradoria,
    empresaId: string,
  ): Promise<SegmentoCuradoria> {
    this.logger.log(
      `Saving segmentoCuradoria ${segmento.segmentoId} of manuscrito ${segmento.manuscritoId}`,
    );

    const criadoPor = this.empresaContextService.get()?.userId ?? 'system';
    const data = SegmentoCuradoriaMapper.toPrismaCreateData(segmento, criadoPor);

    const saved = await this.tenantFactory.withTenant(empresaId, async (tx) => {
      return tx.segmentoCuradoria.upsert({
        where: {
          manuscritoId_segmentoId: {
            manuscritoId: data.manuscritoId,
            segmentoId: data.segmentoId,
          },
        },
        create: data,
        update: { acao: data.acao },
      });
    });

    this.logger.log(`SegmentoCuradoria saved: ${saved.id}`);
    return SegmentoCuradoriaMapper.toDomain(saved);
  }

  /**
   * Busca a curadoria de um segmento específico dentro de um manuscrito.
   */
  async findByManuscritoAndSegmento(
    manuscritoId: string,
    segmentoId: string,
    empresaId: string,
  ): Promise<SegmentoCuradoria | null> {
    const row = await this.tenantFactory.withTenant(empresaId, async (tx) => {
      return tx.segmentoCuradoria.findUnique({
        where: {
          manuscritoId_segmentoId: { manuscritoId, segmentoId },
        },
      });
    });

    if (!row) return null;
    return SegmentoCuradoriaMapper.toDomain(row);
  }
}
