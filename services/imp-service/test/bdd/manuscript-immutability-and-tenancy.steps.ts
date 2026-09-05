/**
 * BDD suite for: Manuscript immutability, history and tenant isolation
 * Contract: test/bdd/features/manuscript-immutability-and-tenancy.feature
 *
 * Runs against a NestJS TestingModule with in-memory fakes.
 *
 * All 5 scenarios are now active:
 *   1. Re-uploading creates a new manuscript (immutability)
 *   2. History is append-only and newest-first
 *   3. Cross-empresa read → 404
 *   4. Read without imp:read scope → 403
 *   5. Deleting the owning project cascades to its manuscripts + purges binaries
 *
 * Issues: IMP-020 / IMP-021
 */

// ── Env vars required by ConfigModule (before any Nest import) ─────────────────
process.env['NODE_ENV'] = 'test';
process.env['JWT_ISSUER_URI'] = 'http://test-issuer/realms/test';
process.env['JWT_AUDIENCE'] = 'imp-service-test';
process.env['DATABASE_URL'] = 'postgresql://test:test@localhost:5432/cordele_test';
process.env['FILE_STORAGE_ADAPTER'] = 'local';
process.env['FILE_STORAGE_BASE_DIR'] = '/tmp/cordele-bdd-test';

import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

import {
  ExecutionContext,
  ForbiddenException,
  Global,
  INestApplication,
  Module,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { defineFeature, loadFeature } from 'jest-cucumber';
import request from 'supertest';

import type { AuthenticatedUser } from 'src/infrastructure/auth/jwt-auth.guard';
import { REQUIRED_SCOPES_KEY } from 'src/infrastructure/auth/jwt-auth.guard';
import { EventBusModule } from 'src/infrastructure/events/event-bus.module';
import { ProblemDetailFilter } from 'src/infrastructure/http/problem-detail.filter';
import { ImpModule } from 'src/modules/imp/imp.module';
import { CascadeDeleteProjetoUseCase } from 'src/modules/imp/use-cases/cascade-delete-projeto.use-case';
import { FILE_STORAGE_PORT } from 'src/domain/imp/ports/file-storage.port';
import { FIND_PROJETO_PORT } from 'src/domain/imp/ports/find-projeto.port';
import { MANUSCRIPT_PARSER_PORT } from 'src/domain/imp/ports/manuscript-parser.port';
import { MANUSCRITO_REPOSITORY_PORT } from 'src/domain/imp/ports/manuscrito-repository.port';
import { SEGMENTO_CURADORIA_REPOSITORY_PORT } from 'src/domain/imp/ports/segmento-curadoria-repository.port';
import { CREATE_PROJETO_EDITORIAL_PORT, ADVANCE_PROJETO_STATUS_PORT } from 'src/domain/imp/ports/proj-port';
import type { ContentTree } from 'src/domain/imp/content-tree';
import type { FileStoragePort } from 'src/domain/imp/ports/file-storage.port';
import type { FindProjetoPort } from 'src/domain/imp/ports/find-projeto.port';
import type { ManuscriptParserPort } from 'src/domain/imp/ports/manuscript-parser.port';
import { Manuscrito } from 'src/domain/imp/manuscrito.entity';
import type { ManuscritoRepositoryPort } from 'src/domain/imp/ports/manuscrito-repository.port';
import type { SegmentoCuradoria } from 'src/domain/imp/segmento-curadoria.entity';
import type { SegmentoCuradoriaRepositoryPort } from 'src/domain/imp/ports/segmento-curadoria-repository.port';

// ── Fixture path ──────────────────────────────────────────────────────────────

const FIXTURES_DIR = join(__dirname, '..', 'fixtures');

function readFixture(name: string): Buffer | null {
  try {
    return readFileSync(join(FIXTURES_DIR, name));
  } catch {
    return null;
  }
}

// ── Projeto identifier mapping ─────────────────────────────────────────────────

const PROJ_100_UUID = 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const PROJ_200_UUID = 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';

// ── Fake ContentTree (minimal, for immutability and history scenarios) ─────────

const FAKE_CONTENT_TREE_IMUT: ContentTree = {
  chapters: [
    {
      id: 'ch-imut-1',
      title: 'Capítulo 1',
      order: 0,
      sections: [
        {
          id: 'sec-imut-1',
          title: 'Seção 1',
          order: 0,
          blocks: [
            { id: 'p-imut-1', type: 'paragraph', content: 'Parágrafo de teste.', order: 0 },
          ],
          unparsedSegments: [],
        },
      ],
    },
  ],
  orphanUnparsedSegments: [],
};

// ── Fake parser — always returns FAKE_CONTENT_TREE_IMUT ──────────────────────

const imutFakeParser: ManuscriptParserPort = {
  supports: (_mimeType: string) => true,
  parse: async (_buffer: Buffer, _mimeType: string): Promise<ContentTree> =>
    FAKE_CONTENT_TREE_IMUT,
};

// ── Fake file storage — tracks deleted storage keys for scenario 5 ────────────

const imutDeletedStorageKeys: string[] = [];

const imutFakeFileStorage: FileStoragePort = {
  store: async (_buf, filename, _mime, empresaId, manuscritoId) =>
    `${empresaId}/${manuscritoId}/${filename}`,
  retrieve: async (_key: string) => Buffer.from('fake'),
  delete: async (key: string) => {
    imutDeletedStorageKeys.push(key);
  },
};

// ── Fake in-memory repository ─────────────────────────────────────────────────

const imutManuscritoStore = new Map<string, Manuscrito>();

const imutFakeManuscritoRepo: ManuscritoRepositoryPort = {
  save: async (ms: Manuscrito, _empresaId: string) => {
    imutManuscritoStore.set(ms.id, ms);
    return ms;
  },
  findById: async (id: string, empresaId: string) => {
    const ms = imutManuscritoStore.get(id);
    // Enforce empresa isolation: only return if the manuscript's empresaId matches.
    if (ms && ms.empresaId === empresaId) return ms;
    return null;
  },
  findByProjetoId: async (projetoId: string, empresaId: string) =>
    [...imutManuscritoStore.values()].filter(
      (m) => m.projetoId === projetoId && m.empresaId === empresaId,
    ),
  deleteByProjetoId: async (projetoId: string, empresaId: string) => {
    for (const [id, ms] of imutManuscritoStore.entries()) {
      if (ms.projetoId === projetoId && ms.empresaId === empresaId) {
        imutManuscritoStore.delete(id);
      }
    }
  },
  findSummariesByProjetoIds: async (projetoIds: string[], _empresaId: string) => {
    const seen = new Set<string>();
    const result = [];
    for (const ms of imutManuscritoStore.values()) {
      if (projetoIds.includes(ms.projetoId) && !seen.has(ms.projetoId)) {
        seen.add(ms.projetoId);
        result.push({ projetoId: ms.projetoId, totalCapitulos: ms.estrutura?.chapters?.length ?? 0, totalImagens: 0 });
      }
    }
    return result;
  },
};

const imutFakeSegmentoCuradoriaRepo: SegmentoCuradoriaRepositoryPort = {
  save: async (seg: SegmentoCuradoria, _empresaId: string) => seg,
  findByManuscritoAndSegmento: async () => null,
  findAllByManuscrito: async () => [],
  deleteByManuscritoAndSegmento: async () => undefined,
};

// ── Fake FindProjetoPort ──────────────────────────────────────────────────────

const imutFakeFindProjeto: FindProjetoPort = {
  findById: async (projetoId: string, empresaId: string) => {
    // Accept both proj-100 and proj-200 in aetos.
    const knownProjects = [PROJ_100_UUID, PROJ_200_UUID];
    if (knownProjects.includes(projetoId) && empresaId === 'aetos') {
      return { projetoId };
    }
    return null;
  },
};

// ── @Global() module that exposes fakes ──────────────────────────────────────

@Global()
@Module({
  providers: [
    { provide: MANUSCRITO_REPOSITORY_PORT, useValue: imutFakeManuscritoRepo },
    { provide: SEGMENTO_CURADORIA_REPOSITORY_PORT, useValue: imutFakeSegmentoCuradoriaRepo },
    { provide: FILE_STORAGE_PORT, useValue: imutFakeFileStorage },
    { provide: MANUSCRIPT_PARSER_PORT, useValue: imutFakeParser },
    { provide: FIND_PROJETO_PORT, useValue: imutFakeFindProjeto },
  ],
  exports: [
    MANUSCRITO_REPOSITORY_PORT,
    SEGMENTO_CURADORIA_REPOSITORY_PORT,
    FILE_STORAGE_PORT,
    MANUSCRIPT_PARSER_PORT,
    FIND_PROJETO_PORT,
  ],
})
class ImutBddFakeInfraModule {}

// ── Fake PROJ port stubs ──────────────────────────────────────────────────────

@Global()
@Module({
  providers: [
    {
      provide: CREATE_PROJETO_EDITORIAL_PORT,
      useValue: {
        create: async (_input: { manuscritoId: string; titulo: string; empresaId: string }) => ({
          projetoId: `proj-${randomUUID()}`,
        }),
      },
    },
    {
      provide: ADVANCE_PROJETO_STATUS_PORT,
      useValue: { advance: async () => undefined },
    },
  ],
  exports: [CREATE_PROJETO_EDITORIAL_PORT, ADVANCE_PROJETO_STATUS_PORT],
})
class ImutProjFakeModule {}

// ── Auth principal fixtures ───────────────────────────────────────────────────

const TEST_USER_AETOS_FULL: AuthenticatedUser = {
  userId: '00000000-0000-0000-0000-000000000077',
  username: 'imut-bdd-editor',
  roles: ['imp-user'],
  scopes: ['imp:read', 'imp:write'],
  empresaId: 'aetos',
};

// ── Configurable guard state (mutated per scenario in step defs) ──────────────
//
// The guard stub reads `imutGuardState.user` at request time (lazy) and enforces
// `@RequiredScopes` metadata via `imutGuardState.reflector` (set in beforeAll).
// This lets individual scenarios override the active user without re-creating the app.

const imutGuardState: {
  user: AuthenticatedUser;
  reflector: Reflector | null;
} = {
  user: TEST_USER_AETOS_FULL,
  reflector: null,
};

const imutAuthGuardStub = {
  canActivate: (context: ExecutionContext): boolean => {
    const req = context.switchToHttp().getRequest<Record<string, unknown>>();
    req['user'] = imutGuardState.user;

    // Enforce @RequiredScopes metadata when Reflector is available (set in beforeAll).
    // This mirrors the logic in JwtAuthGuard.enforceScopes so that scope-based tests
    // work against the stub without bringing in the real JWT infrastructure.
    if (imutGuardState.reflector) {
      const required = imutGuardState.reflector.getAllAndOverride<string[] | undefined>(
        REQUIRED_SCOPES_KEY,
        [context.getHandler(), context.getClass()],
      );
      if (required && required.length > 0) {
        const hasScope = required.some((s) => imutGuardState.user.scopes.includes(s));
        if (!hasScope) {
          throw new ForbiddenException(
            `Insufficient scope. Required one of: ${required.join(', ')}`,
          );
        }
      }
    }

    return true;
  },
};

// ── Feature ───────────────────────────────────────────────────────────────────

const feature = loadFeature(
  join(__dirname, 'features', 'manuscript-immutability-and-tenancy.feature'),
);

defineFeature(feature, (test) => {
  let app: INestApplication;
  let response: request.Response;
  let man1Id: string; // pre-seeded manuscript id for immutability scenario

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        ImutBddFakeInfraModule,
        ImutProjFakeModule,
        EventBusModule,
        ImpModule,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new ProblemDetailFilter());
    app.useGlobalGuards(imutAuthGuardStub as Parameters<typeof app.useGlobalGuards>[0]);
    await app.init();

    // Wire Reflector so the guard stub can enforce @RequiredScopes metadata.
    imutGuardState.reflector = moduleRef.get(Reflector);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    imutManuscritoStore.clear();
    imutDeletedStorageKeys.length = 0;
    man1Id = '';
    // Reset to the full-scopes user so each scenario starts with a clean state.
    imutGuardState.user = TEST_USER_AETOS_FULL;
  });

  // ── Scenario 1: Re-uploading creates a new manuscript, never mutating the old one ──

  test('Re-uploading the same file creates a new manuscript, never mutating the old one', ({
    and,
    given,
    then,
    when,
  }) => {
    given('an authenticated editor of empresa "aetos"', () => {
      // Auth injected globally by imutAuthGuardStub (TEST_USER_AETOS_FULL).
    });

    given('an existing project "proj-100" in the active empresa', () => {
      // imutFakeFindProjeto knows proj-100 UUID in aetos.
    });

    and('a manuscript "man-1" already imported into "proj-100"', () => {
      // Pre-populate the fake store with a known manuscript.
      man1Id = randomUUID();
      const man1 = new Manuscrito({
        id: man1Id,
        projetoId: PROJ_100_UUID,
        empresaId: 'aetos',
        filename: 'livro-pre-existing.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        storageKey: 'aetos/man-1/livro-pre-existing.docx',
        estrutura: FAKE_CONTENT_TREE_IMUT,
        status: 'imported',
        createdAt: new Date('2024-01-01T10:00:00Z'),
      });
      imutManuscritoStore.set(man1Id, man1);
    });

    when('the editor uploads "livro-3-capitulos.docx" with projetoId "proj-100"', async () => {
      const fileBuffer = readFixture('livro-3-capitulos.docx') ?? Buffer.alloc(128, 0x50);
      response = await request(app.getHttpServer())
        .post('/api/v1/imp/manuscripts')
        .field('projetoId', PROJ_100_UUID)
        .attach('file', fileBuffer, 'livro-3-capitulos.docx');
    });

    then('the response status is 201', () => {
      expect(response.status).toBe(201);
    });

    and('a new manuscritoId different from "man-1" is returned', () => {
      const newId: string = response.body.id as string;
      expect(newId).toBeDefined();
      expect(typeof newId).toBe('string');
      expect(newId).not.toBe(man1Id);
    });

    and('manuscript "man-1" is unchanged', () => {
      // man-1 must still be present in the store with its original data.
      const original = imutManuscritoStore.get(man1Id);
      expect(original).toBeDefined();
      expect(original?.id).toBe(man1Id);
      expect(original?.filename).toBe('livro-pre-existing.docx');
      // createdAt must not have changed.
      expect(original?.createdAt.toISOString()).toBe('2024-01-01T10:00:00.000Z');
    });
  });

  // ── Scenario 2: A project's import history is append-only and newest-first ──

  test("A project's import history is append-only and newest-first", ({
    and,
    given,
    then,
    when,
  }) => {
    given('an authenticated editor of empresa "aetos"', () => {
      // Auth injected globally.
    });

    given('an existing project "proj-100" with 2 imported manuscripts', () => {
      // Pre-populate 2 manuscripts: older first, newer second.
      const olderMs = new Manuscrito({
        id: randomUUID(),
        projetoId: PROJ_100_UUID,
        empresaId: 'aetos',
        filename: 'livro-antigo.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        storageKey: 'aetos/older/livro-antigo.docx',
        estrutura: FAKE_CONTENT_TREE_IMUT,
        status: 'imported',
        createdAt: new Date('2024-01-01T08:00:00Z'),
      });
      const newerMs = new Manuscrito({
        id: randomUUID(),
        projetoId: PROJ_100_UUID,
        empresaId: 'aetos',
        filename: 'livro-novo.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        storageKey: 'aetos/newer/livro-novo.docx',
        estrutura: FAKE_CONTENT_TREE_IMUT,
        status: 'imported',
        createdAt: new Date('2024-06-15T12:00:00Z'),
      });
      imutManuscritoStore.set(olderMs.id, olderMs);
      imutManuscritoStore.set(newerMs.id, newerMs);
    });

    when('the editor lists manuscripts of project "proj-100"', async () => {
      response = await request(app.getHttpServer())
        .get(`/api/v1/imp/projetos/${PROJ_100_UUID}/manuscritos`);
    });

    then('the response status is 200', () => {
      expect(response.status).toBe(200);
    });

    and('2 manuscripts are returned ordered by criadoEm descending', () => {
      const list = response.body as Array<{ createdAt: string; filename: string }>;
      expect(list).toHaveLength(2);
      // Verify descending order: first item must be newer than second.
      const first = new Date(list[0].createdAt).getTime();
      const second = new Date(list[1].createdAt).getTime();
      expect(first).toBeGreaterThan(second);
      // Confirm the newer manuscript comes first.
      expect(list[0].filename).toBe('livro-novo.docx');
      expect(list[1].filename).toBe('livro-antigo.docx');
    });
  });

  // ── Scenario 3: Cross-empresa 404 ────────────────────────────────────────────
  //
  // A manuscript that exists in empresa "outra" is not visible to an editor of empresa
  // "aetos". The service returns 404 because findById(id, 'aetos') returns null
  // (ManuscritoRepositoryPort enforces empresa isolation).

  test('Reading a manuscript of another empresa is not found', ({ given, then, when }) => {
    let manXId: string;

    given('an authenticated editor of empresa "aetos"', () => {
      // Auth injected globally (imutGuardState.user = TEST_USER_AETOS_FULL).
    });

    given('a manuscript "man-x" belonging to empresa "outra"', () => {
      // Pre-populate the store with a manuscript that belongs to a different empresa.
      manXId = randomUUID();
      const manX = new Manuscrito({
        id: manXId,
        projetoId: PROJ_100_UUID,
        empresaId: 'outra',
        filename: 'livro-outra-empresa.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        storageKey: `outra/${manXId}/livro-outra-empresa.docx`,
        estrutura: FAKE_CONTENT_TREE_IMUT,
        status: 'imported',
        createdAt: new Date(),
      });
      imutManuscritoStore.set(manXId, manX);
    });

    when('the editor reads manuscript "man-x"', async () => {
      // The authenticated user is in empresa "aetos"; the manuscript belongs to "outra".
      // findById(manXId, 'aetos') returns null → service throws NotFoundException (404).
      response = await request(app.getHttpServer())
        .get(`/api/v1/imp/manuscripts/${manXId}`);
    });

    then('the response status is 404', () => {
      expect(response.status).toBe(404);
    });
  });

  // ── Scenario 4: 403 without imp:read scope ───────────────────────────────────
  //
  // The @RequiredScopes('imp:read') decorator on GET /manuscripts/:id causes the guard
  // stub to throw ForbiddenException (403) when the user's scopes lack imp:read.

  test('A read without the required scope is forbidden', ({ given, then, when }) => {
    let targetManuscritoId: string;

    given('an authenticated editor of empresa "aetos"', () => {
      // Base user is TEST_USER_AETOS_FULL (reset in beforeEach).
    });

    given("the editor's token lacks scope \"imp:read\"", () => {
      // Override guard state to inject a user missing the imp:read scope.
      imutGuardState.user = {
        ...TEST_USER_AETOS_FULL,
        scopes: ['imp:write'], // imp:write only — no imp:read
      };
    });

    when('the editor reads manuscript "man-1"', async () => {
      // Pre-seed a manuscript so the guard is the only thing blocking access
      // (using a fixed UUID to avoid ParseUUIDPipe rejecting an empty value).
      targetManuscritoId = randomUUID();
      const ms = new Manuscrito({
        id: targetManuscritoId,
        projetoId: PROJ_100_UUID,
        empresaId: 'aetos',
        filename: 'livro-scope-test.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        storageKey: `aetos/${targetManuscritoId}/livro-scope-test.docx`,
        estrutura: FAKE_CONTENT_TREE_IMUT,
        status: 'imported',
        createdAt: new Date(),
      });
      imutManuscritoStore.set(targetManuscritoId, ms);

      // The guard stub reads @RequiredScopes('imp:read') metadata and throws 403.
      response = await request(app.getHttpServer())
        .get(`/api/v1/imp/manuscripts/${targetManuscritoId}`);
    });

    then('the response status is 403', () => {
      expect(response.status).toBe(403);
    });
  });

  // ── Scenario 5: Cascade delete + binary purge ────────────────────────────────
  //
  // When the PROJ service deletes a project, the CascadeDeleteProjetoUseCase is
  // triggered (in production via an event consumer; here invoked directly via app.get).
  // All manuscripts of the project must be removed from the repo and their stored
  // binaries purged via FileStoragePort.delete.

  test('Deleting the owning project cascades to its manuscripts', ({
    and,
    given,
    then,
    when,
  }) => {
    let manuscritoId: string;
    let expectedStorageKey: string;

    given('an authenticated editor of empresa "aetos"', () => {
      // Auth injected globally.
    });

    given('an existing project "proj-200" with 1 imported manuscript', () => {
      // Pre-populate a manuscript for proj-200.
      manuscritoId = randomUUID();
      expectedStorageKey = `aetos/${manuscritoId}/livro-proj200.docx`;
      const ms = new Manuscrito({
        id: manuscritoId,
        projetoId: PROJ_200_UUID,
        empresaId: 'aetos',
        filename: 'livro-proj200.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        storageKey: expectedStorageKey,
        estrutura: FAKE_CONTENT_TREE_IMUT,
        status: 'imported',
        createdAt: new Date(),
      });
      imutManuscritoStore.set(manuscritoId, ms);
    });

    when('the project "proj-200" is deleted by the PROJ context', async () => {
      // Simulate the PROJ→IMP cascade event by invoking the use case directly.
      // In production this would be driven by a ProjetoDeletedEvent consumer.
      // Architectural assumption: CascadeDeleteProjetoUseCase is accessible via
      // app.get() because it is registered as a provider in ImpModule (P7).
      const cascadeUseCase = app.get(CascadeDeleteProjetoUseCase);
      await cascadeUseCase.execute({ projetoId: PROJ_200_UUID, empresaId: 'aetos' });
    });

    then('the manuscripts of "proj-200" are removed', () => {
      // The manuscript must no longer be present in the fake repo.
      const remaining = [...imutManuscritoStore.values()].filter(
        (m) => m.projetoId === PROJ_200_UUID,
      );
      expect(remaining).toHaveLength(0);
    });

    and('their stored binaries and images are purged', () => {
      // FileStoragePort.delete must have been called with the manuscript's storageKey.
      expect(imutDeletedStorageKeys).toContain(expectedStorageKey);
    });
  });
});
