/**
 * IMP service — End-to-end contract test (P8-FIX-e2e).
 *
 * Exercita roteamento, validação de DTO, wiring de DI e guard stub para as 7 rotas
 * reais do ImpController. Não depende de PostgreSQL real: todos os ports de
 * persistência/storage/parser recebem fakes in-memory expostos por um módulo
 * @Global() de teste.
 *
 * Objetivo central do wiring:
 *   - ProjStubModule (@Global) expõe CREATE_PROJETO_EDITORIAL_PORT e
 *     ADVANCE_PROJETO_STATUS_PORT para ImpModule → use cases resolvem sem erro.
 *   - Todos os outros ports resolvem via FakeInfraModule (@Global) definido aqui.
 *
 * O que NÃO é testado aqui:
 *   - Verificação criptográfica de JWT (unit test de JwtAuthGuard / BDD P7).
 *   - Lógica de persistência real (prisma-manuscrito.repository.spec.ts).
 *   - BDD / Cucumber (test:bdd separado).
 */

// ────────────────────────────────────────────────────────────────────────────────
// Vars de ambiente necessárias para ConfigModule (antes de qualquer import Nest).
// ────────────────────────────────────────────────────────────────────────────────
process.env.NODE_ENV = 'test';
process.env.JWT_ISSUER_URI = 'http://test-issuer/realms/test';
process.env.JWT_AUDIENCE = 'imp-service-test';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/cordele_test';
process.env.FILE_STORAGE_ADAPTER = 'local';
process.env.FILE_STORAGE_BASE_DIR = '/tmp/cordele-e2e-test';

import {
  ExecutionContext,
  Global,
  INestApplication,
  Module,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { ImpModule } from '../src/modules/imp/imp.module';
import { ProjStubModule } from '../src/infrastructure/proj/proj-stub.module';
import { EventBusModule } from '../src/infrastructure/events/event-bus.module';
import type { AuthenticatedUser } from '../src/infrastructure/auth/jwt-auth.guard';
import { FIND_PROJETO_PORT } from '../src/domain/imp/ports/find-projeto.port';
import { MANUSCRITO_REPOSITORY_PORT } from '../src/domain/imp/ports/manuscrito-repository.port';
import { SEGMENTO_CURADORIA_REPOSITORY_PORT } from '../src/domain/imp/ports/segmento-curadoria-repository.port';
import { FILE_STORAGE_PORT } from '../src/domain/imp/ports/file-storage.port';
import { MANUSCRIPT_PARSER_PORT } from '../src/domain/imp/ports/manuscript-parser.port';
import type { FindProjetoPort } from '../src/domain/imp/ports/find-projeto.port';
import type { ManuscritoRepositoryPort } from '../src/domain/imp/ports/manuscrito-repository.port';
import type { SegmentoCuradoriaRepositoryPort } from '../src/domain/imp/ports/segmento-curadoria-repository.port';
import type { FileStoragePort } from '../src/domain/imp/ports/file-storage.port';
import type { ManuscriptParserPort } from '../src/domain/imp/ports/manuscript-parser.port';
import type { ContentTree } from '../src/domain/imp/content-tree';
import type { Manuscrito } from '../src/domain/imp/manuscrito.entity';
import type { SegmentoCuradoria } from '../src/domain/imp/segmento-curadoria.entity';

// ────────────────────────────────────────────────────────────────────────────────
// Fakes in-memory (definidos fora da classe para serem compartilhados entre testes)
// ────────────────────────────────────────────────────────────────────────────────

/** ID de segmento embutido na ContentTree fake para testar ignore/restore. */
const FAKE_SEG_ID = 'seg-block-e2e-001';

const FAKE_CONTENT_TREE: ContentTree = {
  chapters: [
    {
      id: 'ch-001',
      title: 'Capítulo 1',
      order: 1,
      sections: [
        {
          id: 'sec-001',
          title: 'Seção 1',
          order: 1,
          blocks: [
            {
              id: FAKE_SEG_ID,
              type: 'paragraph',
              content: 'Parágrafo e2e.',
              order: 1,
            },
          ],
          unparsedSegments: [],
        },
      ],
    },
  ],
  orphanUnparsedSegments: [],
};

const fakeParser: ManuscriptParserPort = {
  supports: (_mimeType: string) => true,
  parse: async (_buffer: Buffer, _mimeType: string) => FAKE_CONTENT_TREE,
};

const fakeFileStorage: FileStoragePort = {
  store: async (_buf, filename, _mime, empresaId, manuscritoId) =>
    `${empresaId}/${manuscritoId}/${filename}`,
  retrieve: async (_key: string) => Buffer.from('fake-content'),
  delete: async (_key: string) => undefined,
};

const manuscritoStore = new Map<string, Manuscrito>();
const fakeManuscritoRepo: ManuscritoRepositoryPort = {
  save: async (manuscrito: Manuscrito, _empresaId: string) => {
    manuscritoStore.set(manuscrito.id, manuscrito);
    return manuscrito;
  },
  findById: async (id: string, _empresaId: string) =>
    manuscritoStore.get(id) ?? null,
  findByProjetoId: async (projetoId: string, _empresaId: string) =>
    [...manuscritoStore.values()].filter((m) => m.projetoId === projetoId),
};

const segmentoCuradoriaStore = new Map<string, SegmentoCuradoria>();
const fakeSegmentoCuradoriaRepo: SegmentoCuradoriaRepositoryPort = {
  save: async (seg: SegmentoCuradoria, _empresaId: string) => {
    segmentoCuradoriaStore.set(`${seg.manuscritoId}:${seg.segmentoId}`, seg);
    return seg;
  },
  findByManuscritoAndSegmento: async (
    manuscritoId: string,
    segmentoId: string,
    _empresaId: string,
  ) => segmentoCuradoriaStore.get(`${manuscritoId}:${segmentoId}`) ?? null,
};

// ────────────────────────────────────────────────────────────────────────────────
// Módulo @Global() que expõe os fakes para todos os módulos do TestingModule.
// Necessário porque providers definidos no root do TestingModule não são
// automaticamente visíveis a módulos filhos (diferente de @Global()).
// ────────────────────────────────────────────────────────────────────────────────

// Fake FindProjetoPort — aceita qualquer projetoId (stub de desenvolvimento).
const fakeFindProjeto: FindProjetoPort = {
  findById: async (projetoId: string, _empresaId: string) => ({ projetoId }),
};

@Global()
@Module({
  providers: [
    { provide: MANUSCRITO_REPOSITORY_PORT, useValue: fakeManuscritoRepo },
    { provide: SEGMENTO_CURADORIA_REPOSITORY_PORT, useValue: fakeSegmentoCuradoriaRepo },
    { provide: FILE_STORAGE_PORT, useValue: fakeFileStorage },
    { provide: MANUSCRIPT_PARSER_PORT, useValue: fakeParser },
    { provide: FIND_PROJETO_PORT, useValue: fakeFindProjeto },
  ],
  exports: [
    MANUSCRITO_REPOSITORY_PORT,
    SEGMENTO_CURADORIA_REPOSITORY_PORT,
    FILE_STORAGE_PORT,
    MANUSCRIPT_PARSER_PORT,
    FIND_PROJETO_PORT,
  ],
})
class FakeInfraModule {}

// ────────────────────────────────────────────────────────────────────────────────
// Usuário e constantes de teste
// ────────────────────────────────────────────────────────────────────────────────

const TEST_USER: AuthenticatedUser = {
  userId: '00000000-0000-0000-0000-000000000001',
  username: 'e2e-runner',
  roles: ['imp-user'],
  scopes: ['imp:read', 'imp:write'],
  empresaId: 'aetos',
};

/** Deve ser um UUID v4 válido — ParseUUIDPipe e @IsUUID() rejeitam outros formatos. */
const TEST_PROJETO_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

// Guard stub: injeta TEST_USER sem verificar JWT.
// Usado via app.useGlobalGuards() — evita o problema de substituição de
// APP_GUARD multi-provider com useClass.
const authGuardStub = {
  canActivate: (context: ExecutionContext): boolean => {
    const req = context.switchToHttp().getRequest<Record<string, unknown>>();
    req['user'] = TEST_USER;
    return true;
  },
};

// ────────────────────────────────────────────────────────────────────────────────
// Suite
// ────────────────────────────────────────────────────────────────────────────────

describe('IMP — HTTP surface (e2e)', () => {
  let app: INestApplication;
  let importedManuscritoId: string;

  beforeAll(async () => {
    /**
     * TestModule dedicado:
     *   - ConfigModule        → ConfigService disponível
     *   - FakeInfraModule     → @Global; fakes in-memory de todos os ports
     *   - EventBusModule      → @Global; EVENT_BUS_PORT in-memory
     *   - ProjStubModule      → @Global; PROJ stubs (prova o fix de DI)
     *   - ImpModule           → controller + use cases + ImpService
     */
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        FakeInfraModule,
        EventBusModule,
        ProjStubModule,
        ImpModule,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalGuards(authGuardStub as Parameters<typeof app.useGlobalGuards>[0]);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    manuscritoStore.clear();
    segmentoCuradoriaStore.clear();
  });

  // ── Validação de DTO ──────────────────────────────────────────────────────────

  it('POST /manuscripts — rejeita upload sem arquivo → 400', async () => {
    // Sem campo file → BadRequestException("O campo 'file' é obrigatório.").
    await request(app.getHttpServer())
      .post('/api/v1/imp/manuscripts')
      .field('projetoId', TEST_PROJETO_ID)
      .expect(400);
  });

  it('POST /manuscripts — rejeita projetoId que não é UUID → 400', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/imp/manuscripts')
      .field('projetoId', 'not-a-uuid')
      .attach('file', Buffer.alloc(8), 'test.docx')
      .expect(400);
  });

  // ── Fluxo principal ───────────────────────────────────────────────────────────

  it('POST /manuscripts — importa manuscrito e retorna 201 com ManuscritoDetailDto', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/imp/manuscripts')
      .field('projetoId', TEST_PROJETO_ID)
      .attach('file', Buffer.alloc(8), 'capitulo-01.docx')
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.projetoId).toBe(TEST_PROJETO_ID);
    expect(res.body.empresaId).toBe(TEST_USER.empresaId);
    expect(res.body.filename).toBe('capitulo-01.docx');
    // D-B / D-A: parse síncrono → status 'imported'.
    expect(res.body.status).toBe('imported');

    importedManuscritoId = res.body.id as string;
  });

  it('GET /manuscripts/:id — retorna detalhe do manuscrito importado → 200', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/imp/manuscripts/${importedManuscritoId}`)
      .expect(200);

    expect(res.body.id).toBe(importedManuscritoId);
    expect(res.body.filename).toBe('capitulo-01.docx');
  });

  it('GET /manuscripts/:id — retorna 422 para ID inexistente', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/imp/manuscripts/00000000-0000-0000-0000-000000000000')
      .expect(422);
  });

  it('GET /manuscripts/:id/estrutura — retorna ContentTree do manuscrito → 200', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/imp/manuscripts/${importedManuscritoId}/estrutura`)
      .expect(200);

    expect(res.body.manuscritoId).toBe(importedManuscritoId);
    expect(res.body.estrutura).toBeDefined();
    expect(res.body.estrutura.chapters).toHaveLength(1);
  });

  it('GET /projetos/:projetoId/manuscritos — lista manuscritos do projeto → 200', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/imp/projetos/${TEST_PROJETO_ID}/manuscritos`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    expect(res.body[0].projetoId).toBe(TEST_PROJETO_ID);
  });

  it('POST /manuscripts/:id/segmentos/:segId/ignore — ignora segmento → 201', async () => {
    // Contrato: 201 Created (primeira anotação) — idempotente retorna 200, mas aqui é a 1ª chamada.
    await request(app.getHttpServer())
      .post(
        `/api/v1/imp/manuscripts/${importedManuscritoId}/segmentos/${FAKE_SEG_ID}/ignore`,
      )
      .send({ motivo: 'não relevante para a edição' })
      .expect(201);
  });

  it('DELETE /manuscripts/:id/segmentos/:segId/ignore — restaura segmento → 204', async () => {
    await request(app.getHttpServer())
      .delete(
        `/api/v1/imp/manuscripts/${importedManuscritoId}/segmentos/${FAKE_SEG_ID}/ignore`,
      )
      .expect(204);
  });

  it('POST /manuscripts/:id/confirm-estrutura — confirma estrutura → 200', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/imp/manuscripts/${importedManuscritoId}/confirm-estrutura`)
      .expect(200);
  });
});
