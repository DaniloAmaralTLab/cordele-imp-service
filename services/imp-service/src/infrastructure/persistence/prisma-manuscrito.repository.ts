import { Inject, Injectable, Logger } from '@nestjs/common';

import type { Manuscrito } from '../../domain/imp/manuscrito.entity';
import type { ManuscritoRepositoryPort, ManuscritoSummaryRecord } from '../../domain/imp/ports/manuscrito-repository.port';
import { ManuscritoMapper } from './manuscrito.mapper';
import { TenantPrismaFactory } from './tenant-prisma.factory';

/**
 * PrismaManuscritoRepository — adapter de persistência para o agregado `Manuscrito`.
 *
 * Implementa `ManuscritoRepositoryPort` usando Prisma + schema-per-tenant.
 *
 * RULE-01: sem imports de @prisma/client no domain.
 * RULE-07: `empresaId` é requerido em todos os métodos para isolamento multi-empresa.
 * INSERT-only: `save()` jamais chama `update()` ou `upsert()` (imutabilidade do agregado).
 *
 * O `TenantPrismaFactory.withTenant()` cria um `PrismaClient` com `datasourceUrl`
 * própria (`?schema=emp_<slug>`), garantindo isolamento real entre tenants (D-619).
 */
@Injectable()
export class PrismaManuscritoRepository implements ManuscritoRepositoryPort {
  private readonly logger = new Logger(PrismaManuscritoRepository.name);

  constructor(
    @Inject(TenantPrismaFactory)
    private readonly tenantFactory: TenantPrismaFactory,
  ) {}

  /**
   * Persiste um novo Manuscrito (INSERT-only — sem UPDATE/UPSERT).
   *
   * Lança `PrismaClientKnownRequestError` se houver conflito de PK (duplicata de id).
   */
  async save(manuscrito: Manuscrito, empresaId: string): Promise<Manuscrito> {
    this.logger.log(
      `Saving manuscrito ${manuscrito.id} for empresa ${empresaId}`,
    );

    const data = ManuscritoMapper.toPrismaCreateData(manuscrito);

    const saved = await this.tenantFactory.withTenant(empresaId, async (tx) => {
      return tx.manuscrito.create({ data });
    });

    this.logger.log(`Manuscrito ${saved.id} saved successfully`);
    return ManuscritoMapper.toDomain(saved, empresaId);
  }

  /**
   * Carrega um Manuscrito pelo id dentro da empresa.
   * Retorna `null` se não encontrado ou pertencer a outra empresa (schema-per-tenant).
   */
  async findById(id: string, empresaId: string): Promise<Manuscrito | null> {
    const row = await this.tenantFactory.withTenant(empresaId, async (tx) => {
      return tx.manuscrito.findUnique({ where: { id } });
    });

    if (!row) return null;
    return ManuscritoMapper.toDomain(row, empresaId);
  }

  /**
   * Lista manuscritos de um projeto dentro da empresa.
   */
  async findByProjetoId(
    projetoId: string,
    empresaId: string,
  ): Promise<Manuscrito[]> {
    const rows = await this.tenantFactory.withTenant(empresaId, async (tx) => {
      return tx.manuscrito.findMany({
        where: { projetoId },
        orderBy: { criadoEm: 'desc' },
      });
    });

    return rows.map((row) => ManuscritoMapper.toDomain(row, empresaId));
  }

  /**
   * Remove todos os manuscritos de um projeto dentro da empresa (cascade delete).
   *
   * Chamado APÓS purgar os binários via FileStoragePort (de responsabilidade do use case).
   * Usa `deleteMany` — seguro pois o schema-per-tenant garante isolamento.
   */
  async deleteByProjetoId(projetoId: string, empresaId: string): Promise<void> {
    this.logger.log(
      `Deleting all manuscripts for projetoId=${projetoId} empresa=${empresaId}`,
    );
    await this.tenantFactory.withTenant(empresaId, async (tx) => {
      await tx.manuscrito.deleteMany({ where: { projetoId } });
    });
    this.logger.log(
      `All manuscripts for projetoId=${projetoId} deleted successfully`,
    );
  }

  /**
   * Retorna o sumário do manuscrito mais recente de cada projetoId solicitado.
   *
   * Query em lote (um único findMany) — projetos sem manuscrito são omitidos.
   * A desduplicação por projetoId (pick mais recente) é feita em memória após
   * o orderBy criadoEm desc, sem subquery.
   */
  async findSummariesByProjetoIds(
    projetoIds: string[],
    empresaId: string,
  ): Promise<ManuscritoSummaryRecord[]> {
    if (projetoIds.length === 0) return [];

    const rows = await this.tenantFactory.withTenant(empresaId, async (tx) => {
      return tx.manuscrito.findMany({
        where: { projetoId: { in: projetoIds } },
        orderBy: { criadoEm: 'desc' },
        select: {
          projetoId: true,
          totalCapitulos: true,
          totalImagens: true,
          criadoEm: true,
        },
      });
    });

    // Pick the most recent manuscript per project (rows are already desc by criadoEm)
    const seen = new Set<string>();
    const result: ManuscritoSummaryRecord[] = [];
    for (const row of rows) {
      if (!seen.has(row.projetoId)) {
        seen.add(row.projetoId);
        result.push({
          projetoId: row.projetoId,
          totalCapitulos: row.totalCapitulos,
          totalImagens: row.totalImagens,
        });
      }
    }
    return result;
  }
}
