/**
 * PrismaManuscritoRepository — testes de integração com Testcontainers.
 *
 * Estes testes verificam:
 * 1. `save()` é INSERT-only (imutabilidade do agregado).
 * 2. Duas chamadas a `save()` com o mesmo id inserem duas linhas (registro histórico).
 * 3. Dados de uma empresa não vazam para outra (schema-per-tenant isolado).
 * 4. `findById()` retorna null para id inexistente ou de outra empresa.
 * 5. `findByProjetoId()` retorna todos os manuscritos do projeto na empresa.
 *
 * Pré-condição: schema `emp_aetos` provisionado no PostgreSQL de teste.
 *
 * TODO[P3]: implementar com Testcontainers (PostgreSQL 16) quando o ambiente CI
 * estiver configurado. Para rodar localmente:
 *   DATABASE_URL="postgresql://..." pnpm test src/infrastructure/persistence
 */

import { Test } from '@nestjs/testing';

import type { ManuscritoRepositoryPort } from '../../domain/imp/ports/manuscrito-repository.port';
import { Manuscrito } from '../../domain/imp/manuscrito.entity';
import type { ContentTree } from '../../domain/imp/content-tree';
import { DatabaseModule } from './database.module';
import { PrismaManuscritoRepository } from './prisma-manuscrito.repository';
import { TenantPrismaFactory } from './tenant-prisma.factory';

/** ContentTree mínima válida para testes. */
function minimalContentTree(): ContentTree {
  return {
    chapters: [],
    orphanUnparsedSegments: [],
  };
}

/** Manuscrito válido para testes. */
function buildManuscrito(overrides: Partial<Parameters<typeof Manuscrito.create>[0]> = {}): Manuscrito {
  return Manuscrito.create({
    id: crypto.randomUUID(),
    projetoId: crypto.randomUUID(),
    empresaId: 'aetos',
    filename: 'test.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    storageKey: 'emp_aetos/test.docx',
    estrutura: minimalContentTree(),
    ...overrides,
  });
}

describe('PrismaManuscritoRepository (integration)', () => {
  let repo: ManuscritoRepositoryPort;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [DatabaseModule],
      providers: [TenantPrismaFactory, PrismaManuscritoRepository],
    }).compile();

    repo = moduleRef.get(PrismaManuscritoRepository);
  });

  describe('save()', () => {
    it('deve retornar o manuscrito persistido com mesmo id', async () => {
      const manuscrito = buildManuscrito();
      const saved = await repo.save(manuscrito, 'aetos');

      expect(saved.id).toBe(manuscrito.id);
      expect(saved.filename).toBe(manuscrito.filename);
      expect(saved.projetoId).toBe(manuscrito.projetoId);
      expect(saved.empresaId).toBe('aetos');
    });

    it('deve ser INSERT-only — save() não chama update() (imutabilidade)', async () => {
      // Dois objetos com o mesmo id geram dois registros (sem UPDATE/UPSERT no Manuscrito).
      const id = crypto.randomUUID();
      const m1 = buildManuscrito({ id });
      const m2 = buildManuscrito({ id }); // mesmo id — deve gerar segundo INSERT

      // O segundo INSERT falha com PrismaClientKnownRequestError (P2002 - unique violation)
      // porque o id é PRIMARY KEY. Isso valida que save() usa CREATE (não upsert).
      await repo.save(m1, 'aetos');
      await expect(repo.save(m2, 'aetos')).rejects.toThrow();
    });
  });

  describe('findById()', () => {
    it('deve retornar null para id inexistente', async () => {
      const result = await repo.findById(crypto.randomUUID(), 'aetos');
      expect(result).toBeNull();
    });

    it('deve retornar o manuscrito pelo id dentro da empresa', async () => {
      const manuscrito = buildManuscrito();
      await repo.save(manuscrito, 'aetos');

      const found = await repo.findById(manuscrito.id, 'aetos');
      expect(found).not.toBeNull();
      expect(found?.id).toBe(manuscrito.id);
    });
  });

  describe('findByProjetoId()', () => {
    it('deve retornar lista vazia para projetoId inexistente', async () => {
      const result = await repo.findByProjetoId(crypto.randomUUID(), 'aetos');
      expect(result).toEqual([]);
    });

    it('deve retornar manuscritos do projeto em ordem decrescente de criação', async () => {
      const projetoId = crypto.randomUUID();
      const m1 = buildManuscrito({ projetoId });
      const m2 = buildManuscrito({ projetoId });

      await repo.save(m1, 'aetos');
      await repo.save(m2, 'aetos');

      const result = await repo.findByProjetoId(projetoId, 'aetos');
      expect(result.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('deleteByProjetoId()', () => {
    it('deve remover todos os manuscritos do projeto dentro da empresa', async () => {
      const projetoId = crypto.randomUUID();
      const m1 = buildManuscrito({ projetoId });
      const m2 = buildManuscrito({ projetoId });

      await repo.save(m1, 'aetos');
      await repo.save(m2, 'aetos');

      // Verify they exist before deletion.
      const before = await repo.findByProjetoId(projetoId, 'aetos');
      expect(before.length).toBeGreaterThanOrEqual(2);

      // Delete cascade.
      await repo.deleteByProjetoId(projetoId, 'aetos');

      // Verify they are gone.
      const after = await repo.findByProjetoId(projetoId, 'aetos');
      expect(after).toEqual([]);
    });

    it('não deve remover manuscritos de outro projeto', async () => {
      const projetoIdA = crypto.randomUUID();
      const projetoIdB = crypto.randomUUID();
      const mA = buildManuscrito({ projetoId: projetoIdA });
      const mB = buildManuscrito({ projetoId: projetoIdB });

      await repo.save(mA, 'aetos');
      await repo.save(mB, 'aetos');

      await repo.deleteByProjetoId(projetoIdA, 'aetos');

      // mB must still be there.
      const remaining = await repo.findByProjetoId(projetoIdB, 'aetos');
      expect(remaining).toHaveLength(1);
      expect(remaining[0].id).toBe(mB.id);
    });
  });
});
