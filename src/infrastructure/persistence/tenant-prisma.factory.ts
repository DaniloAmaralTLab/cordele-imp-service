import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '../prisma-client';

/**
 * Factory de Prisma com isolamento de schema por empresa (multi-empresa).
 *
 * `SET LOCAL search_path` (a abordagem original) NÃO isola tenants com o Prisma
 * Client: cada query gerada é qualificada com o schema fixo embutido em
 * `DATABASE_URL` (`?schema=...`) no momento da conexão, e o Prisma ignora
 * mudanças de `search_path` em runtime — confirmado com `log:['query']` (o SQL
 * gerado sempre usa `"<schema-da-url>"."<tabela>"`, nunca o schema setado via
 * `SET LOCAL`). Este é um limite conhecido do Prisma Client sem a preview
 * feature `multiSchema` (que exige `@@schema()` estático por model — incompatível
 * com um conjunto de tenants resolvido em runtime a partir do JWT).
 *
 * Solução: um `PrismaClient` por schema, cada um com sua própria `datasourceUrl`
 * (`?schema=emp_<slug>`), cacheado pelo processo. Isso é seguro aqui porque
 * tenants são pré-cadastrados e conhecidos em design-time (multi-empresa.md —
 * "N known units of the same economic group"), não descoberta dinâmica: o
 * número de clients no cache é limitado ao número de empresas do grupo, não a
 * requisições ou usuários.
 *
 * Todo acesso a dados deve ser escopado por empresaId.
 *
 * Uso:
 * ```ts
 * await this.tenantFactory.withTenant(empresaId, async (tx) => {
 *   return tx.manuscrito.findUnique({ where: { id } });
 * });
 * ```
 */
@Injectable()
export class TenantPrismaFactory implements OnModuleDestroy {
  private readonly logger = new Logger(TenantPrismaFactory.name);
  private readonly clientsBySchema = new Map<string, PrismaClient>();

  /**
   * Executa um bloco de operações no schema da empresa especificada, dentro de
   * uma transação Prisma (atomicidade entre múltiplas escritas).
   *
   * @param empresaId Slug da empresa (ex.: "aetos" → schema "emp_aetos")
   * @param fn        Bloco de operações Prisma a executar no contexto da empresa
   */
  async withTenant<T>(
    empresaId: string,
    fn: (tx: Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]) => Promise<T>,
  ): Promise<T> {
    const client = this.clientForSchema(this.resolveSchema(empresaId));
    return client.$transaction(fn);
  }

  /** Returns the cached PrismaClient for the schema, creating it on first use. */
  private clientForSchema(schema: string): PrismaClient {
    let client = this.clientsBySchema.get(schema);
    if (!client) {
      this.logger.log(`Opening PrismaClient for schema ${schema}`);
      client = new PrismaClient({ datasourceUrl: this.buildSchemaUrl(schema) });
      this.clientsBySchema.set(schema, client);
    }
    return client;
  }

  /** Rewrites the base `DATABASE_URL` with the `schema` query param set to the target schema. */
  private buildSchemaUrl(schema: string): string {
    const base = process.env.DATABASE_URL;
    if (!base) {
      throw new Error('DATABASE_URL is not set');
    }
    const url = new URL(base);
    url.searchParams.set('schema', schema);
    return url.toString();
  }

  /**
   * Resolve o schema Postgres a partir do empresaId recebido.
   *
   * Defensivo: aceita slug puro ("aetos") ou já prefixado ("emp_aetos") — ambos
   * produzem o mesmo schema ("emp_aetos"). O JwtStrategy normaliza o claim
   * empresa_id para slug antes de popular request.user.empresaId, mas a
   * defensividade evita duplo prefixo se o chamador já trouxer "emp_".
   */
  private resolveSchema(empresaId: string): string {
    const slug = empresaId.startsWith('emp_') ? empresaId.slice(4) : empresaId;
    return `emp_${slug}`;
  }

  /** Closes every cached per-schema connection pool on Nest shutdown. */
  async onModuleDestroy(): Promise<void> {
    await Promise.all(
      Array.from(this.clientsBySchema.values()).map((client) => client.$disconnect()),
    );
  }
}
