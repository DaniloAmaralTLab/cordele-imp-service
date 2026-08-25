import { Inject, Injectable, Logger } from '@nestjs/common';

import type { Manuscrito } from '../../domain/imp/manuscrito.entity';
import type { ManuscritoRepositoryPort } from '../../domain/imp/ports/manuscrito-repository.port';
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
 * O `TenantPrismaFactory.withTenant()` executa `SET LOCAL search_path TO emp_{slug}`
 * dentro da transação, garantindo isolamento entre tenants concorrentes.
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
}
