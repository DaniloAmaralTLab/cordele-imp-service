import { Injectable } from '@nestjs/common';

import { PrismaService } from './prisma.service';

/**
 * Factory de Prisma com isolamento de schema por empresa (multi-empresa).
 *
 * Executa `SET LOCAL search_path TO emp_{slug}, public` dentro de uma transação
 * antes de qualquer operação, garantindo que queries sejam roteadas para o schema
 * correto sem vazar entre tenants concorrentes.
 *
 * RULE-07: todo acesso a dados deve ser escopado por empresaId.
 *
 * Uso:
 * ```ts
 * await this.tenantFactory.withTenant(empresaId, async (tx) => {
 *   return tx.manuscrito.findUnique({ where: { id } });
 * });
 * ```
 *
 * @see docs/architecture/shared/multi-empresa.md
 */
@Injectable()
export class TenantPrismaFactory {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Executa um bloco de operações no schema da empresa especificada.
   *
   * `SET LOCAL search_path` é transação-local: quando a transação termina o
   * search_path retorna ao padrão da sessão, evitando leaks entre requisições
   * concorrentes no mesmo pool de conexões.
   *
   * @param empresaId Slug da empresa (ex.: "aetos" → schema "emp_aetos")
   * @param fn        Bloco de operações Prisma a executar no contexto da empresa
   */
  async withTenant<T>(
    empresaId: string,
    fn: (tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0]) => Promise<T>,
  ): Promise<T> {
    const slug = this.resolveSlug(empresaId);
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL search_path TO emp_${slug}, public`);
      return fn(tx);
    });
  }

  /**
   * Resolve o slug do schema a partir do empresaId recebido.
   *
   * Aceita dois formatos:
   * - slug puro: "aetos" → schema "emp_aetos"
   * - slug prefixado: "emp_aetos" → schema "emp_aetos" (sem duplo prefixo)
   */
  private resolveSlug(empresaId: string): string {
    return empresaId.startsWith('emp_') ? empresaId.slice(4) : empresaId;
  }
}
