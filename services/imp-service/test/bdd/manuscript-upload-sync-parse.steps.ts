/**
 * BDD suite for: Synchronous manuscript upload and parse
 * Contract: test/bdd/features/manuscript-upload-sync-parse.feature
 *
 * Tests the POST /manuscripts multipart endpoint: format/size validation,
 * project binding (D-C), sync parse (D-A), RFC 7807 problem detail responses.
 *
 * All scenarios run against a NestJS TestingModule with in-memory fakes.
 * No PostgreSQL, no S3, no real parser — the fake parser is configured
 * per-scenario to return the expected ContentTree or throw.
 *
 * Issue: IMP-020 / IMP-021
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
import { ImpModule } from 'src/modules/imp/imp.module';
import { FILE_STORAGE_PORT } from 'src/domain/imp/ports/file-storage.port';
import { FIND_PROJETO_PORT } from 'src/domain/imp/ports/find-projeto.port';
import { MANUSCRIPT_PARSER_PORT, ManuscriptParseError } from 'src/domain/imp/ports/manuscript-parser.port';
import { MANUSCRITO_REPOSITORY_PORT } from 'src/domain/imp/ports/manuscrito-repository.port';
import { SEGMENTO_CURADORIA_REPOSITORY_PORT } from 'src/domain/imp/ports/segmento-curadoria-repository.port';
import type { Block } from 'src/domain/imp/block';
import type { Chapter, ContentTree } from 'src/domain/imp/content-tree';
import type { FileStoragePort } from 'src/domain/imp/ports/file-storage.port';
import type { FindProjetoPort } from 'src/domain/imp/ports/find-projeto.port';
import type { ManuscriptParserPort } from 'src/domain/imp/ports/manuscript-parser.port';
import type { Manuscrito } from 'src/domain/imp/manuscrito.entity';
import type { ManuscritoRepositoryPort } from 'src/domain/imp/ports/manuscrito-repository.port';
import type { SegmentoCuradoria } from 'src/domain/imp/segmento-curadoria.entity';
import type { SegmentoCuradoriaRepositoryPort } from 'src/domain/imp/ports/segmento-curadoria-repository.port';

// ── Fixture path ─────────────────────────────────────────────────────────────────

const FIXTURES_DIR = join(__dirname, '..', 'fixtures');

/** Read fixture from disk if it exists, otherwise return null. */
function readFixture(name: string): Buffer | null {
  try {
    return readFileSync(join(FIXTURES_DIR, name));
  } catch {
    return null;
  }
}

// ── Projeto identifier mapping ─────────────────────────────────────────────────
// BDD uses human-readable labels; the HTTP layer requires UUID v4.

const PROJETO_IDS: Record<string, string> = {
  'proj-100': 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  'proj-999': 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380b99',
};

/** UUID for "proj-100" — exists in the active empresa (aetos). */
const PROJ_100_UUID = PROJETO_IDS['proj-100'];

/** UUID for "proj-999" — belongs to empresa "outra", not visible in "aetos". */
const PROJ_999_UUID = PROJETO_IDS['proj-999'];

// ── Fake ContentTree — returned for DOCX/Markdown happy path ─────────────────
// 3 chapters, 2 image blocks (in ch-1 and ch-2), 0 unparsed segments.

const makeImageBlock = (id: string, order: number): Block => ({
  id,
  type: 'image',
  content: `img-${id}.png`,
  order,
});

const FAKE_CONTENT_TREE_3C2I: ContentTree = {
  chapters: [
    {
      id: 'ch-1',
      title: 'Capítulo 1 — Início',
      order: 0,
      sections: [
        {
          id: 'sec-1-1',
          title: 'Seção 1.1',
          order: 0,
          blocks: [
            { id: 'p-1', type: 'paragraph', content: 'Texto do primeiro capítulo.', order: 0 },
            makeImageBlock('img-1', 1),
          ],
          unparsedSegments: [],
        },
      ],
    } satisfies Chapter,
    {
      id: 'ch-2',
      title: 'Capítulo 2 — Meio',
      order: 1,
      sections: [
        {
          id: 'sec-2-1',
          title: 'Seção 2.1',
          order: 0,
          blocks: [
            { id: 'p-2', type: 'paragraph', content: 'Texto do segundo capítulo.', order: 0 },
            makeImageBlock('img-2', 1),
          ],
          unparsedSegments: [],
        },
      ],
    } satisfies Chapter,
    {
      id: 'ch-3',
      title: 'Capítulo 3 — Fim',
      order: 2,
      sections: [
        {
          id: 'sec-3-1',
          title: 'Seção 3.1',
          order: 0,
          blocks: [
            { id: 'p-3', type: 'paragraph', content: 'Texto do terceiro capítulo.', order: 0 },
          ],
          unparsedSegments: [],
        },
      ],
    } satisfies Chapter,
  ],
  orphanUnparsedSegments: [],
};

/** Simpler ContentTree for Markdown scenarios (no specific count assertions). */
const FAKE_CONTENT_TREE_MD: ContentTree = {
  chapters: [
    {
      id: 'ch-md-1',
      title: 'Capítulo 1',
      order: 0,
      sections: [
        {
          id: 'sec-md-1',
          title: 'Seção 1',
          order: 0,
          blocks: [{ id: 'p-md-1', type: 'paragraph', content: 'Conteúdo Markdown.', order: 0 }],
          unparsedSegments: [],
        },
      ],
    },
  ],
  orphanUnparsedSegments: [],
};

// ── Configurable fake parser ──────────────────────────────────────────────────

type ParserMode = 'success-docx' | 'success-md' | 'fail';
let parserMode: ParserMode = 'success-docx';

const configurableFakeParser: ManuscriptParserPort = {
  supports: (_mimeType: string) => true,
  parse: async (_buffer: Buffer, mimeType: string): Promise<ContentTree> => {
    if (parserMode === 'fail') {
      throw new ManuscriptParseError('Simulated irrecoverable parse failure');
    }
    if (mimeType === 'text/markdown') return FAKE_CONTENT_TREE_MD;
    return FAKE_CONTENT_TREE_3C2I;
  },
};

// ── Fake file storage ─────────────────────────────────────────────────────────

const fakeFileStorage: FileStoragePort = {
  store: async (_buf, filename, _mime, empresaId, manuscritoId) =>
    `${empresaId}/${manuscritoId}/${filename}`,
  retrieve: async (_key: string) => Buffer.from('fake'),
  delete: async (_key: string) => undefined,
};

// ── Fake in-memory repositories ───────────────────────────────────────────────

const manuscritoStore = new Map<string, Manuscrito>();

const fakeManuscritoRepo: ManuscritoRepositoryPort = {
  save: async (ms: Manuscrito, _empresaId: string) => {
    manuscritoStore.set(ms.id, ms);
    return ms;
  },
  findById: async (id: string, _empresaId: string) => manuscritoStore.get(id) ?? null,
  findByProjetoId: async (projetoId: string, _empresaId: string) =>
    [...manuscritoStore.values()].filter((m) => m.projetoId === projetoId),
  deleteByProjetoId: async (projetoId: string, _empresaId: string) => {
    const keysToDelete = [...manuscritoStore.entries()]
      .filter(([_, ms]) => ms.projetoId === projetoId)
      .map(([key]) => key);
    keysToDelete.forEach((key) => manuscritoStore.delete(key));
  },
};

const fakeSegmentoCuradoriaRepo: SegmentoCuradoriaRepositoryPort = {
  save: async (seg: SegmentoCuradoria, _empresaId: string) => seg,
  findByManuscritoAndSegmento: async () => null,
  findAllByManuscrito: async () => [],
  deleteByManuscritoAndSegmento: async () => undefined,
};

// ── Fake FindProjetoPort ──────────────────────────────────────────────────────
// "proj-100" exists in "aetos". "proj-999" does NOT exist in "aetos".

const fakeFindProjeto: FindProjetoPort = {
  findById: async (projetoId: string, empresaId: string) => {
    // proj-100 UUID is valid in empresa "aetos".
    if (projetoId === PROJ_100_UUID && empresaId === 'aetos') {
      return { projetoId };
    }
    // proj-999 UUID is NOT in empresa "aetos" — cross-tenant, return null.
    return null;
  },
};

// ── Fake CreateProjetoEditorialPort — records created projects ────────────────

const createdProjects: Array<{ projetoId: string; titulo: string }> = [];

const fakeCreateProjeto = {
  create: async (input: { manuscritoId: string; titulo: string; empresaId: string }) => {
    const projetoId = `novo-proj-${input.titulo.toLowerCase().replace(/\s+/g, '-')}`;
    createdProjects.push({ projetoId, titulo: input.titulo });
    return { projetoId };
  },
};

// ── @Global() module that exposes fakes ───────────────────────────────────────

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
class UploadBddFakeInfraModule {}

// ── ProjStub override with fakeCreateProjeto ──────────────────────────────────
// ProjStubModule provides CREATE_PROJETO_EDITORIAL_PORT globally.
// We override it per-test by providing our recording fake in the TestingModule.
// NOTE: ProjStubModule is imported BEFORE UploadBddFakeInfraModule so our
// overrides take effect (last-registered wins in NestJS).

import { CREATE_PROJETO_EDITORIAL_PORT } from 'src/domain/imp/ports/proj-port';
import { ADVANCE_PROJETO_STATUS_PORT } from 'src/domain/imp/ports/proj-port';

@Global()
@Module({
  providers: [
    { provide: CREATE_PROJETO_EDITORIAL_PORT, useValue: fakeCreateProjeto },
    { provide: ADVANCE_PROJETO_STATUS_PORT, useValue: { advance: async () => undefined } },
  ],
  exports: [CREATE_PROJETO_EDITORIAL_PORT, ADVANCE_PROJETO_STATUS_PORT],
})
class UploadProjFakeModule {}

// ── Auth stub ─────────────────────────────────────────────────────────────────

const TEST_USER_AETOS: AuthenticatedUser = {
  userId: '00000000-0000-0000-0000-000000000099',
  username: 'editor-bdd',
  roles: ['imp-user'],
  scopes: ['imp:read', 'imp:write'],
  empresaId: 'aetos',
};

const authGuardStub = {
  canActivate: (context: ExecutionContext): boolean => {
    const req = context.switchToHttp().getRequest<Record<string, unknown>>();
    req['user'] = TEST_USER_AETOS;
    return true;
  },
};

// ── Feature ───────────────────────────────────────────────────────────────────

const feature = loadFeature(
  join(__dirname, 'features', 'manuscript-upload-sync-parse.feature'),
);

defineFeature(feature, (test) => {
  let app: INestApplication;
  let response: request.Response;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        UploadBddFakeInfraModule,
        UploadProjFakeModule,
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
    app.useGlobalGuards(authGuardStub as Parameters<typeof app.useGlobalGuards>[0]);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    parserMode = 'success-docx';
    manuscritoStore.clear();
    createdProjects.length = 0;
  });

  // ── Scenario 1: happy path DOCX ─────────────────────────────────────────────
  //
  // "Upload a clean DOCX into an existing project returns the parsed manuscript synchronously"

  test('Upload a clean DOCX into an existing project returns the parsed manuscript synchronously', ({
    given,
    and,
    when,
    then,
  }) => {
    given('an authenticated editor of empresa "aetos" with scope "imp:write"', () => {
      // Auth injected globally by authGuardStub.
    });

    and('an existing project "proj-100" in the active empresa', () => {
      // fakeFindProjeto already knows proj-100 UUID in aetos.
    });

    when('the editor uploads "livro-3-capitulos.docx" with projetoId "proj-100"', async () => {
      // Read the real fixture if available; otherwise use a small synthetic buffer.
      const fileBuffer = readFixture('livro-3-capitulos.docx') ?? Buffer.alloc(128, 0x50);
      response = await request(app.getHttpServer())
        .post('/api/v1/imp/manuscripts')
        .field('projetoId', PROJ_100_UUID)
        .attach('file', fileBuffer, 'livro-3-capitulos.docx');
    });

    then('the response status is 201', () => {
      expect(response.status).toBe(201);
    });

    and('the response body contains a manuscritoId', () => {
      expect(response.body.id).toBeDefined();
      expect(typeof response.body.id).toBe('string');
    });

    and('the response body field "status" is "imported"', () => {
      expect(response.body.status).toBe('imported');
    });

    and('the response body contains the content tree "estrutura"', () => {
      expect(response.body.estrutura).toBeDefined();
      expect(response.body.estrutura.chapters).toBeDefined();
    });

    and('the manuscript reports 3 chapters and 2 images and 0 unparsed segments', () => {
      expect(response.body.totalCapitulos).toBe(3);
      expect(response.body.totalImagens).toBe(2);
      expect(response.body.trechosNaoParseados).toBe(0);
    });

    and('the response contains no field "parseJobId"', () => {
      expect(response.body.parseJobId).toBeUndefined();
    });
  });

  // ── Scenario 2: create-and-upload ───────────────────────────────────────────
  //
  // "Create-and-upload in one action creates the project through PROJ"

  test('Create-and-upload in one action creates the project through PROJ', ({
    given,
    and,
    when,
    then,
  }) => {
    given('an authenticated editor of empresa "aetos" with scope "imp:write"', () => {
      // Auth injected globally.
    });

    and('an existing project "proj-100" in the active empresa', () => {
      // Background step — just establishing context.
    });

    when('the editor uploads "livro.md" with projetoTitulo "Meu Novo Livro"', async () => {
      parserMode = 'success-md';
      response = await request(app.getHttpServer())
        .post('/api/v1/imp/manuscripts')
        .field('projetoTitulo', 'Meu Novo Livro')
        .attach('file', Buffer.from('# Meu Novo Livro\n\nConteúdo.'), 'livro.md');
    });

    then('the response status is 201', () => {
      expect(response.status).toBe(201);
    });

    and('a ProjetoEditorial titled "Meu Novo Livro" was created via the PROJ port', () => {
      expect(createdProjects.some((p) => p.titulo === 'Meu Novo Livro')).toBe(true);
    });

    and('the manuscript is bound to that new project', () => {
      const proj = createdProjects.find((p) => p.titulo === 'Meu Novo Livro');
      expect(proj).toBeDefined();
      expect(response.body.projetoId).toBe(proj!.projetoId);
    });
  });

  // ── Scenario 3: ambiguous project binding ────────────────────────────────────
  //
  // "Ambiguous project binding is rejected"

  test('Ambiguous project binding is rejected', ({ given, and, when, then }) => {
    given('an authenticated editor of empresa "aetos" with scope "imp:write"', () => {});
    and('an existing project "proj-100" in the active empresa', () => {});

    when('the editor uploads "livro.md" with both projetoId "proj-100" and projetoTitulo "X"', async () => {
      response = await request(app.getHttpServer())
        .post('/api/v1/imp/manuscripts')
        .field('projetoId', PROJ_100_UUID)
        .field('projetoTitulo', 'X')
        .attach('file', Buffer.from('# Livro\n'), 'livro.md');
    });

    then('the response status is 400', () => {
      expect(response.status).toBe(400);
    });

    and('the problem type is "urn:cordele:imp:invalid-project-binding"', () => {
      expect(response.body.type).toBe('urn:cordele:imp:invalid-project-binding');
    });
  });

  // ── Scenario 4: missing project binding ─────────────────────────────────────
  //
  // "Missing project binding is rejected"

  test('Missing project binding is rejected', ({ given, and, when, then }) => {
    given('an authenticated editor of empresa "aetos" with scope "imp:write"', () => {});
    and('an existing project "proj-100" in the active empresa', () => {});

    when('the editor uploads "livro.md" with no project binding', async () => {
      response = await request(app.getHttpServer())
        .post('/api/v1/imp/manuscripts')
        .attach('file', Buffer.from('# Livro\n'), 'livro.md');
      // No projetoId, no projetoTitulo → ProjectBindingInvalidError.
    });

    then('the response status is 400', () => {
      expect(response.status).toBe(400);
    });

    and('the problem type is "urn:cordele:imp:invalid-project-binding"', () => {
      expect(response.body.type).toBe('urn:cordele:imp:invalid-project-binding');
    });
  });

  // ── Scenario Outline: unsupported / oversized ────────────────────────────────
  //
  // "Unsupported and oversized files are rejected before any persistence"

  test('Unsupported and oversized files are rejected before any persistence', ({
    given,
    and,
    when,
    then,
  }) => {
    let fixture: string;
    let expectedStatus: number;
    let expectedType: string;

    given('an authenticated editor of empresa "aetos" with scope "imp:write"', () => {});
    and('an existing project "proj-100" in the active empresa', () => {});

    when(/^the editor uploads "(.*)" with projetoId "proj-100"$/, async (fixtureArg: string) => {
      fixture = fixtureArg;

      let fileBuffer: Buffer;
      if (fixture === 'livro-51mb.docx') {
        // Construct a 53 MB buffer in memory (gitignored fixture, seed not required).
        fileBuffer = Buffer.alloc(53_690_000, 0x50);
      } else if (fixture === 'livro.pdf') {
        // Minimal fake PDF content.
        fileBuffer = Buffer.from('%PDF-1.4\n%%EOF\n');
      } else {
        fileBuffer = readFixture(fixture) ?? Buffer.alloc(256);
      }

      response = await request(app.getHttpServer())
        .post('/api/v1/imp/manuscripts')
        .field('projetoId', PROJ_100_UUID)
        .attach('file', fileBuffer, fixture);
    });

    then(/^the response status is (.*)$/, (statusArg: string) => {
      expectedStatus = parseInt(statusArg, 10);
      expect(response.status).toBe(expectedStatus);
    });

    and(/^the problem type is "(.*)"$/, (typeArg: string) => {
      expectedType = typeArg;
      expect(response.body.type).toBe(expectedType);
    });

    and('no manuscript is persisted', () => {
      // The in-memory store must be empty: no manuscript was saved.
      expect(manuscritoStore.size).toBe(0);
    });
  });

  // ── Scenario 6: cross-tenant projetoId ──────────────────────────────────────
  //
  // "Referencing a project not in the active empresa is rejected"

  test('Referencing a project not in the active empresa is rejected', ({
    given,
    and,
    when,
    then,
  }) => {
    given('an authenticated editor of empresa "aetos" with scope "imp:write"', () => {});
    and('an existing project "proj-100" in the active empresa', () => {});

    given('a project "proj-999" belonging to empresa "outra"', () => {
      // fakeFindProjeto returns null for proj-999 UUID in empresa "aetos".
    });

    when('the editor uploads "livro.md" with projetoId "proj-999"', async () => {
      response = await request(app.getHttpServer())
        .post('/api/v1/imp/manuscripts')
        .field('projetoId', PROJ_999_UUID)
        .attach('file', Buffer.from('# Livro\n'), 'livro.md');
    });

    then('the response status is 422', () => {
      expect(response.status).toBe(422);
    });

    and('the problem type is "urn:cordele:imp:projeto-not-found"', () => {
      expect(response.body.type).toBe('urn:cordele:imp:projeto-not-found');
    });
  });

  // ── Scenario 7: irrecoverable parse failure ──────────────────────────────────
  //
  // "Irrecoverable parse failure is rejected with no persistence"

  test('Irrecoverable parse failure is rejected with no persistence', ({
    given,
    and,
    when,
    then,
  }) => {
    given('an authenticated editor of empresa "aetos" with scope "imp:write"', () => {});
    and('an existing project "proj-100" in the active empresa', () => {});

    when('the editor uploads "livro-corrompido.docx" with projetoId "proj-100"', async () => {
      parserMode = 'fail';
      const fileBuffer = readFixture('livro-corrompido.docx') ?? Buffer.alloc(100, 0xff);
      response = await request(app.getHttpServer())
        .post('/api/v1/imp/manuscripts')
        .field('projetoId', PROJ_100_UUID)
        .attach('file', fileBuffer, 'livro-corrompido.docx');
    });

    then('the response status is 422', () => {
      expect(response.status).toBe(422);
    });

    and('the problem type is "urn:cordele:imp:parse-failed"', () => {
      expect(response.body.type).toBe('urn:cordele:imp:parse-failed');
    });

    and('no manuscript is persisted', () => {
      expect(manuscritoStore.size).toBe(0);
    });
  });
});
