/**
 * BDD step definitions for: Manuscript import API
 * Contract: test/bdd/features/import.feature
 *
 * Runs against a NestJS TestingModule with in-memory fakes — no PostgreSQL required.
 * Mirrors the pattern established in test/imp.e2e-spec.ts (FakeInfraModule @Global).
 *
 * Issue: IMP-020
 */

// ── Env vars required by ConfigModule (before any Nest import) ─────────────────
process.env['NODE_ENV'] = 'test';
process.env['JWT_ISSUER_URI'] = 'http://test-issuer/realms/test';
process.env['JWT_AUDIENCE'] = 'imp-service-test';
process.env['DATABASE_URL'] = 'postgresql://test:test@localhost:5432/cordele_test';
process.env['FILE_STORAGE_ADAPTER'] = 'local';
process.env['FILE_STORAGE_BASE_DIR'] = '/tmp/cordele-bdd-test';

import { join } from 'node:path';

import {
  ExecutionContext,
  Global,
  INestApplication,
  Module,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { defineFeature, loadFeature } from 'jest-cucumber';
import request from 'supertest';

import type { AuthenticatedUser } from 'src/infrastructure/auth/jwt-auth.guard';
import { EventBusModule } from 'src/infrastructure/events/event-bus.module';
import { ProblemDetailFilter } from 'src/infrastructure/http/problem-detail.filter';
import { ProjStubModule } from 'src/infrastructure/proj/proj-stub.module';
import { ImpModule } from 'src/modules/imp/imp.module';
import { FILE_STORAGE_PORT } from 'src/domain/imp/ports/file-storage.port';
import { FIND_PROJETO_PORT } from 'src/domain/imp/ports/find-projeto.port';
import { MANUSCRIPT_PARSER_PORT, ManuscriptParseError } from 'src/domain/imp/ports/manuscript-parser.port';
import { MANUSCRITO_REPOSITORY_PORT } from 'src/domain/imp/ports/manuscrito-repository.port';
import { SEGMENTO_CURADORIA_REPOSITORY_PORT } from 'src/domain/imp/ports/segmento-curadoria-repository.port';
import type { ContentTree } from 'src/domain/imp/content-tree';
import type { FileStoragePort } from 'src/domain/imp/ports/file-storage.port';
import type { FindProjetoPort } from 'src/domain/imp/ports/find-projeto.port';
import type { ManuscriptParserPort } from 'src/domain/imp/ports/manuscript-parser.port';
import type { Manuscrito } from 'src/domain/imp/manuscrito.entity';
import type { ManuscritoRepositoryPort } from 'src/domain/imp/ports/manuscrito-repository.port';
import type { SegmentoCuradoria } from 'src/domain/imp/segmento-curadoria.entity';
import type { SegmentoCuradoriaRepositoryPort } from 'src/domain/imp/ports/segmento-curadoria-repository.port';

// ── Shared fake content tree ───────────────────────────────────────────────────

const FAKE_CONTENT_TREE: ContentTree = {
  chapters: [
    {
      id: 'ch-bdd-001',
      title: 'Capítulo 1',
      order: 1,
      sections: [
        {
          id: 'sec-bdd-001',
          title: 'Seção 1',
          order: 1,
          blocks: [{ id: 'blk-bdd-001', type: 'paragraph', content: 'Parágrafo BDD.', order: 1 }],
          unparsedSegments: [],
        },
      ],
    },
  ],
  orphanUnparsedSegments: [],
};

// ── Configurable fake parser ────────────────────────────────────────────────────
// shouldParserFail is set per-scenario via the "Given the parser will fail" step.

let shouldParserFail = false;

const configurableFakeParser: ManuscriptParserPort = {
  supports: (_mimeType: string) => true,
  parse: async (_buffer: Buffer, _mimeType: string): Promise<ContentTree> => {
    if (shouldParserFail) {
      throw new ManuscriptParseError('Simulated parse failure: corrupt or irrecoverable file');
    }
    return FAKE_CONTENT_TREE;
  },
};

// ── Fake file storage ───────────────────────────────────────────────────────────

const fakeFileStorage: FileStoragePort = {
  store: async (_buf, filename, _mime, empresaId, manuscritoId) =>
    `${empresaId}/${manuscritoId}/${filename}`,
  retrieve: async (_key: string) => Buffer.from('fake-content'),
  delete: async (_key: string) => undefined,
};

// ── Fake in-memory repositories ─────────────────────────────────────────────────

const manuscritoStore = new Map<string, Manuscrito>();
const segmentoCuradoriaStore = new Map<string, SegmentoCuradoria>();

const fakeManuscritoRepo: ManuscritoRepositoryPort = {
  save: async (manuscrito: Manuscrito, _empresaId: string) => {
    manuscritoStore.set(manuscrito.id, manuscrito);
    return manuscrito;
  },
  findById: async (id: string, _empresaId: string) => manuscritoStore.get(id) ?? null,
  findByProjetoId: async (projetoId: string, _empresaId: string) =>
    [...manuscritoStore.values()].filter((m) => m.projetoId === projetoId),
  deleteByProjetoId: async (projetoId: string, _empresaId: string) => {
    for (const [id, ms] of manuscritoStore.entries()) {
      if (ms.projetoId === projetoId) {
        manuscritoStore.delete(id);
      }
    }
  },
};

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
  findAllByManuscrito: async (manuscritoId: string, _empresaId: string) =>
    [...segmentoCuradoriaStore.values()].filter((s) => s.manuscritoId === manuscritoId),
  deleteByManuscritoAndSegmento: async (
    manuscritoId: string,
    segmentoId: string,
    _empresaId: string,
  ) => {
    segmentoCuradoriaStore.delete(`${manuscritoId}:${segmentoId}`);
  },
};

// ── Fake FindProjetoPort — accepts any projetoId (stub behavior) ──────────────

const fakeFindProjeto: FindProjetoPort = {
  findById: async (projetoId: string, _empresaId: string) => ({ projetoId }),
};

// ── @Global() module that exposes fakes ────────────────────────────────────────

@Global()
@Module({
  providers: [
    { provide: MANUSCRITO_REPOSITORY_PORT, useValue: fakeManuscritoRepo },
    { provide: SEGMENTO_CURADORIA_REPOSITORY_PORT, useValue: fakeSegmentoCuradoriaRepo },
    { provide: FILE_STORAGE_PORT, useValue: fakeFileStorage },
    { provide: MANUSCRIPT_PARSER_PORT, useValue: configurableFakeParser },
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
class BddFakeInfraModule {}

// ── Auth stub — injects TEST_USER without verifying JWT ───────────────────────

const TEST_USER: AuthenticatedUser = {
  userId: '00000000-0000-0000-0000-000000000002',
  username: 'bdd-runner',
  roles: ['imp-user'],
  scopes: ['imp:read', 'imp:write'],
  empresaId: 'aetos',
};

const authGuardStub = {
  canActivate: (context: ExecutionContext): boolean => {
    const req = context.switchToHttp().getRequest<Record<string, unknown>>();
    req['user'] = TEST_USER;
    return true;
  },
};

/** Valid UUID v4 used as projetoId in tests that require one. */
const VALID_PROJETO_ID = 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380b22';

// ── Feature file ────────────────────────────────────────────────────────────────

const feature = loadFeature(join(__dirname, 'features', 'import.feature'));

defineFeature(feature, (test) => {
  let app: INestApplication;
  let response: request.Response;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        BddFakeInfraModule,
        EventBusModule,
        ProjStubModule,
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
    app.useGlobalGuards(authGuardStub as Parameters<typeof app.useGlobalGuards>[0]);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    manuscritoStore.clear();
    segmentoCuradoriaStore.clear();
  });

  beforeEach(() => {
    shouldParserFail = false;
  });

  // ── Scenario 1: happy path ───────────────────────────────────────────────────

  test('Upload a DOCX manuscript into an existing project returns 201', ({ given, when, then, and }) => {
    given('an authenticated editor with empresa "aetos" and scope "imp:write"', () => {
      // Auth is provided globally by authGuardStub; empresa comes from TEST_USER.
    });

    when(
      'the editor posts a manuscript upload with filename "livro-3-capitulos.docx" and a valid projetoId',
      async () => {
        response = await request(app.getHttpServer())
          .post('/api/v1/imp/manuscripts')
          .field('projetoId', VALID_PROJETO_ID)
          .attach('file', Buffer.alloc(8), 'livro-3-capitulos.docx');
      },
    );

    then('the response status is 201', () => {
      expect(response.status).toBe(201);
    });

    and('the response body contains a manuscript id', () => {
      expect(response.body.id).toBeDefined();
    });

    and('the response body field "status" equals "PENDING_REVIEW"', () => {
      // D-B / D-A: parse síncrono → status 'imported' (anteriormente 'PENDING_REVIEW').
      expect(response.body.status).toBe('imported');
    });
  });

  // ── Scenario 2: missing projetoId → 400 ─────────────────────────────────────

  test('Upload request without projetoId is rejected with 400', ({ given, when, then }) => {
    given('an authenticated editor with empresa "aetos" and scope "imp:write"', () => {
      // Auth provided by stub.
    });

    when('the editor posts a manuscript upload without a projetoId', async () => {
      // Nenhum campo projetoId nem projetoTitulo → ProjectBindingInvalidError → 400.
      response = await request(app.getHttpServer())
        .post('/api/v1/imp/manuscripts')
        .attach('file', Buffer.alloc(8), 'livro-3-capitulos.docx');
    });

    then('the response status is 400', () => {
      expect(response.status).toBe(400);
    });
  });

  // ── Scenario 3: non-UUID projetoId → 400 ────────────────────────────────────

  test('Upload request with a non-UUID projetoId is rejected with 400', ({ given, when, then }) => {
    given('an authenticated editor with empresa "aetos" and scope "imp:write"', () => {
      // Auth provided by stub.
    });

    when('the editor posts a manuscript upload with projetoId "not-a-uuid"', async () => {
      response = await request(app.getHttpServer())
        .post('/api/v1/imp/manuscripts')
        .field('projetoId', 'not-a-uuid')
        .attach('file', Buffer.alloc(8), 'livro-3-capitulos.docx');
    });

    then('the response status is 400', () => {
      expect(response.status).toBe(400);
    });
  });

  // ── Scenario 4: manuscript not found → 404 ──────────────────────────────────

  test('Reading a manuscript that does not exist returns 404', ({ given, when, then }) => {
    given('an authenticated editor with empresa "aetos" and scope "imp:write"', () => {
      // Auth provided by stub.
    });

    when(
      'the editor reads the manuscript with id "00000000-0000-0000-0000-000000000000"',
      async () => {
        response = await request(app.getHttpServer())
          .get('/api/v1/imp/manuscripts/00000000-0000-0000-0000-000000000000');
      },
    );

    then('the response status is 404', () => {
      expect(response.status).toBe(404);
    });
  });

  // ── Scenario 5: parse failure → 422 ─────────────────────────────────────────

  test('Uploading a corrupt DOCX causes parse failure and returns 422', ({
    given,
    when,
    then,
  }) => {
    given('an authenticated editor with empresa "aetos" and scope "imp:write"', () => {
      // Auth provided by stub.
    });

    given('the parser will fail for the next request', () => {
      shouldParserFail = true;
    });

    when(
      'the editor posts a manuscript upload with filename "livro-corrompido.docx" and a valid projetoId',
      async () => {
        response = await request(app.getHttpServer())
          .post('/api/v1/imp/manuscripts')
          .field('projetoId', VALID_PROJETO_ID)
          .attach('file', Buffer.alloc(8), 'livro-corrompido.docx');
      },
    );

    then('the response status is 422', () => {
      expect(response.status).toBe(422);
    });
  });
});
