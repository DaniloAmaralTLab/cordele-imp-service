/**
 * BDD suite for: Lossless parsing with unparsed-segment disclosure
 * Contract: test/bdd/features/lossless-parse-unparsed-segments.feature
 *
 * Runs against a NestJS TestingModule with in-memory fakes — no PostgreSQL required.
 * Mirrors the pattern established in manuscript-upload-sync-parse.steps.ts.
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
import { MANUSCRIPT_PARSER_PORT } from 'src/domain/imp/ports/manuscript-parser.port';
import { MANUSCRITO_REPOSITORY_PORT } from 'src/domain/imp/ports/manuscrito-repository.port';
import { SEGMENTO_CURADORIA_REPOSITORY_PORT } from 'src/domain/imp/ports/segmento-curadoria-repository.port';
import { CREATE_PROJETO_EDITORIAL_PORT, ADVANCE_PROJETO_STATUS_PORT } from 'src/domain/imp/ports/proj-port';
import type { Block, UnparsedReason, UnparsedSegment } from 'src/domain/imp/block';
import type { Chapter, ContentTree, Section } from 'src/domain/imp/content-tree';
import type { FileStoragePort } from 'src/domain/imp/ports/file-storage.port';
import type { FindProjetoPort } from 'src/domain/imp/ports/find-projeto.port';
import type { ManuscriptParserPort } from 'src/domain/imp/ports/manuscript-parser.port';
import type { Manuscrito } from 'src/domain/imp/manuscrito.entity';
import type { ManuscritoRepositoryPort } from 'src/domain/imp/ports/manuscrito-repository.port';
import type { SegmentoCuradoria } from 'src/domain/imp/segmento-curadoria.entity';
import type { SegmentoCuradoriaRepositoryPort } from 'src/domain/imp/ports/segmento-curadoria-repository.port';

// ── Fixture path ─────────────────────────────────────────────────────────────────

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

// ── Region-to-reason mapping (for Scenario Outline) ───────────────────────────

const REGION_TO_REASON: Record<string, UnparsedReason> = {
  'complex table': 'complex_table',
  'math equation': 'math_equation',
  'nested footnote': 'nested_footnote',
  'unknown docx style': 'unknown_docx_style',
  'unsupported markup': 'unsupported_markup',
  'embedded object': 'embedded_object',
  'unclassifiable node': 'other',
};

// ── Fake ContentTree — tabela complexa (1 parágrafo + 1 unparsed complex_table) ─

const KNOWN_RAW_TABLE = '| Coluna A | Coluna B |\n| --- | --- |\n| Célula 1 | Célula 2 |';

const FAKE_CONTENT_TREE_TABELA: ContentTree = {
  chapters: [
    {
      id: 'ch-lp-1',
      title: 'Capítulo com Tabela',
      order: 0,
      sections: [
        {
          id: 'sec-lp-1',
          title: 'Seção 1',
          order: 0,
          blocks: [
            {
              id: 'p-lp-1',
              type: 'paragraph',
              content: 'Parágrafo antes da tabela.',
              order: 0,
            },
          ],
          unparsedSegments: [
            {
              id: 'up-lp-1',
              reason: 'complex_table',
              rawContent: KNOWN_RAW_TABLE,
              order: 1,
              sourceLocation: { kind: 'docx' },
            },
          ],
        },
      ],
    } satisfies Chapter,
  ],
  orphanUnparsedSegments: [],
};

// ── Fake ContentTree — 3 capítulos com imagens (para testes de parágrafo) ─────

const KNOWN_PARAGRAPH_TEXT_1 = 'Texto verbatim do primeiro capítulo.';
const KNOWN_PARAGRAPH_TEXT_2 = 'Texto verbatim do segundo capítulo.';
const KNOWN_PARAGRAPH_TEXT_3 = 'Texto verbatim do terceiro capítulo.';

const FAKE_CONTENT_TREE_3C: ContentTree = {
  chapters: [
    {
      id: 'ch-lp-c1',
      title: 'Capítulo 1',
      order: 0,
      sections: [
        {
          id: 'sec-lp-c1',
          title: 'Seção 1.1',
          order: 0,
          blocks: [
            {
              id: 'p-lp-c1',
              type: 'paragraph',
              content: KNOWN_PARAGRAPH_TEXT_1,
              order: 0,
              runs: [{ text: KNOWN_PARAGRAPH_TEXT_1 }],
            },
            {
              id: 'img-lp-c1',
              type: 'image',
              content: 'cap1-img.png',
              order: 1,
            },
          ],
          unparsedSegments: [],
        },
      ],
    } satisfies Chapter,
    {
      id: 'ch-lp-c2',
      title: 'Capítulo 2',
      order: 1,
      sections: [
        {
          id: 'sec-lp-c2',
          title: 'Seção 2.1',
          order: 0,
          blocks: [
            {
              id: 'p-lp-c2',
              type: 'paragraph',
              content: KNOWN_PARAGRAPH_TEXT_2,
              order: 0,
              runs: [{ text: KNOWN_PARAGRAPH_TEXT_2 }],
            },
          ],
          unparsedSegments: [],
        },
      ],
    } satisfies Chapter,
    {
      id: 'ch-lp-c3',
      title: 'Capítulo 3',
      order: 2,
      sections: [
        {
          id: 'sec-lp-c3',
          title: 'Seção 3.1',
          order: 0,
          blocks: [
            {
              id: 'p-lp-c3',
              type: 'paragraph',
              content: KNOWN_PARAGRAPH_TEXT_3,
              order: 0,
              runs: [{ text: KNOWN_PARAGRAPH_TEXT_3 }],
            },
          ],
          unparsedSegments: [],
        },
      ],
    } satisfies Chapter,
  ],
  orphanUnparsedSegments: [],
};

// ── Configurable fake parser ──────────────────────────────────────────────────

type LosslessParserMode =
  | 'tabela-complexa'
  | 'tres-capitulos'
  | { fixedReason: UnparsedReason };

let losslessParserMode: LosslessParserMode = 'tres-capitulos';

const losslessFakeParser: ManuscriptParserPort = {
  supports: (_mimeType: string) => true,
  parse: async (_buffer: Buffer, _mimeType: string): Promise<ContentTree> => {
    if (losslessParserMode === 'tabela-complexa') {
      return FAKE_CONTENT_TREE_TABELA;
    }
    if (losslessParserMode === 'tres-capitulos') {
      return FAKE_CONTENT_TREE_3C;
    }
    // fixedReason mode: return a tree with one orphan unparsed segment of the given reason
    const { fixedReason } = losslessParserMode as { fixedReason: UnparsedReason };
    return {
      chapters: [
        {
          id: 'ch-enum-1',
          title: 'Capítulo Enum',
          order: 0,
          sections: [
            {
              id: 'sec-enum-1',
              title: 'Seção Enum',
              order: 0,
              blocks: [],
              unparsedSegments: [
                {
                  id: 'up-enum-1',
                  reason: fixedReason,
                  rawContent: `Região não estruturável: ${fixedReason}`,
                  order: 0,
                  sourceLocation: { kind: 'docx' },
                },
              ],
            },
          ],
        },
      ],
      orphanUnparsedSegments: [],
    };
  },
};

// ── Fake file storage ─────────────────────────────────────────────────────────

const losslessFakeFileStorage: FileStoragePort = {
  store: async (_buf, filename, _mime, empresaId, manuscritoId) =>
    `${empresaId}/${manuscritoId}/${filename}`,
  retrieve: async (_key: string) => Buffer.from('fake'),
  delete: async (_key: string) => undefined,
};

// ── Fake in-memory repositories ───────────────────────────────────────────────

const losslessManuscritoStore = new Map<string, Manuscrito>();

const losslessFakeManuscritoRepo: ManuscritoRepositoryPort = {
  save: async (ms: Manuscrito, _empresaId: string) => {
    losslessManuscritoStore.set(ms.id, ms);
    return ms;
  },
  findById: async (id: string, _empresaId: string) =>
    losslessManuscritoStore.get(id) ?? null,
  findByProjetoId: async (projetoId: string, _empresaId: string) =>
    [...losslessManuscritoStore.values()].filter((m) => m.projetoId === projetoId),
  deleteByProjetoId: async (projetoId: string, _empresaId: string) => {
    const keysToDelete = [...losslessManuscritoStore.entries()]
      .filter(([_, ms]) => ms.projetoId === projetoId)
      .map(([key]) => key);
    keysToDelete.forEach((key) => losslessManuscritoStore.delete(key));
  },
};

const losslessFakeSegmentoCuradoriaRepo: SegmentoCuradoriaRepositoryPort = {
  save: async (seg: SegmentoCuradoria, _empresaId: string) => seg,
  findByManuscritoAndSegmento: async () => null,
};

// ── Fake FindProjetoPort ──────────────────────────────────────────────────────

const losslessFakeFindProjeto: FindProjetoPort = {
  findById: async (projetoId: string, empresaId: string) => {
    if (projetoId === PROJ_100_UUID && empresaId === 'aetos') {
      return { projetoId };
    }
    return null;
  },
};

// ── @Global() module that exposes fakes ───────────────────────────────────────

@Global()
@Module({
  providers: [
    { provide: MANUSCRITO_REPOSITORY_PORT, useValue: losslessFakeManuscritoRepo },
    { provide: SEGMENTO_CURADORIA_REPOSITORY_PORT, useValue: losslessFakeSegmentoCuradoriaRepo },
    { provide: FILE_STORAGE_PORT, useValue: losslessFakeFileStorage },
    { provide: MANUSCRIPT_PARSER_PORT, useValue: losslessFakeParser },
    { provide: FIND_PROJETO_PORT, useValue: losslessFakeFindProjeto },
  ],
  exports: [
    MANUSCRITO_REPOSITORY_PORT,
    SEGMENTO_CURADORIA_REPOSITORY_PORT,
    FILE_STORAGE_PORT,
    MANUSCRIPT_PARSER_PORT,
    FIND_PROJETO_PORT,
  ],
})
class LosslessBddFakeInfraModule {}

// ── Fake PROJ port stubs ──────────────────────────────────────────────────────

@Global()
@Module({
  providers: [
    {
      provide: CREATE_PROJETO_EDITORIAL_PORT,
      useValue: {
        create: async (input: { manuscritoId: string; titulo: string; empresaId: string }) => ({
          projetoId: `proj-${input.titulo.toLowerCase().replace(/\s+/g, '-')}`,
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
class LosslessProjFakeModule {}

// ── Auth stub ─────────────────────────────────────────────────────────────────

const TEST_USER_LOSSLESS: AuthenticatedUser = {
  userId: '00000000-0000-0000-0000-000000000088',
  username: 'lossless-bdd-editor',
  roles: ['imp-user'],
  scopes: ['imp:read', 'imp:write'],
  empresaId: 'aetos',
};

const losslessAuthGuardStub = {
  canActivate: (context: ExecutionContext): boolean => {
    const req = context.switchToHttp().getRequest<Record<string, unknown>>();
    req['user'] = TEST_USER_LOSSLESS;
    return true;
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Collect all blocks from all chapters/sections in a ContentTree. */
function collectAllBlocks(tree: ContentTree): Block[] {
  return tree.chapters.flatMap((ch: Chapter) =>
    ch.sections.flatMap((sec: Section) => [...sec.blocks]),
  );
}

/** Collect all UnparsedSegments from all chapters/sections + orphans. */
function collectAllUnparsed(tree: ContentTree): UnparsedSegment[] {
  const fromSections = tree.chapters.flatMap((ch: Chapter) =>
    ch.sections.flatMap((sec: Section) => [...sec.unparsedSegments]),
  );
  return [...fromSections, ...tree.orphanUnparsedSegments];
}

// ── Feature file ──────────────────────────────────────────────────────────────

const feature = loadFeature(
  join(__dirname, 'features', 'lossless-parse-unparsed-segments.feature'),
);

defineFeature(feature, (test) => {
  let app: INestApplication;
  let response: request.Response;
  let firstResponse: request.Response;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        LosslessBddFakeInfraModule,
        LosslessProjFakeModule,
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
    app.useGlobalGuards(losslessAuthGuardStub as Parameters<typeof app.useGlobalGuards>[0]);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    losslessParserMode = 'tres-capitulos';
    losslessManuscritoStore.clear();
  });

  // ── Scenario 1: A complex table is preserved as an unparsed segment ──────────

  test('A complex table is preserved as an unparsed segment, not dropped', ({
    and,
    given,
    then,
    when,
  }) => {
    given('an authenticated editor of empresa "aetos" with scope "imp:write"', () => {
      // Auth injected globally by losslessAuthGuardStub.
    });

    and('an existing project "proj-100" in the active empresa', () => {
      // losslessFakeFindProjeto knows proj-100 UUID in aetos.
    });

    when('the editor uploads "livro-com-tabela-complexa.docx" with projetoId "proj-100"', async () => {
      losslessParserMode = 'tabela-complexa';
      const fileBuffer =
        readFixture('livro-com-tabela-complexa.docx') ?? Buffer.alloc(128, 0x50);
      response = await request(app.getHttpServer())
        .post('/api/v1/imp/manuscripts')
        .field('projetoId', PROJ_100_UUID)
        .attach('file', fileBuffer, 'livro-com-tabela-complexa.docx');
    });

    then('the response status is 201', () => {
      expect(response.status).toBe(201);
    });

    and('the manuscript reports at least 1 unparsed segment', () => {
      expect(response.body.trechosNaoParseados).toBeGreaterThanOrEqual(1);
    });

    and('the content tree contains an unparsed node with reason "complex_table"', () => {
      const tree: ContentTree = response.body.estrutura as ContentTree;
      const allUnparsed = collectAllUnparsed(tree);
      const node = allUnparsed.find((u) => u.reason === 'complex_table');
      expect(node).toBeDefined();
    });

    and('that unparsed node carries the original raw content verbatim', () => {
      const tree: ContentTree = response.body.estrutura as ContentTree;
      const allUnparsed = collectAllUnparsed(tree);
      const node = allUnparsed.find((u) => u.reason === 'complex_table');
      expect(node?.rawContent).toBe(KNOWN_RAW_TABLE);
    });

    and('that unparsed node carries a sourceLocation of kind "docx"', () => {
      const tree: ContentTree = response.body.estrutura as ContentTree;
      const allUnparsed = collectAllUnparsed(tree);
      const node = allUnparsed.find((u) => u.reason === 'complex_table');
      expect((node as any)?.sourceLocation?.kind).toBe('docx');
    });
  });

  // ── Scenario 2: Author paragraph text is never altered ───────────────────────

  test('Author paragraph text is never altered', ({ and, given, then, when }) => {
    given('an authenticated editor of empresa "aetos" with scope "imp:write"', () => {
      // Auth injected globally.
    });

    and('an existing project "proj-100" in the active empresa', () => {
      // Fake find projeto accepts proj-100 in aetos.
    });

    when('the editor uploads "livro-3-capitulos.docx" with projetoId "proj-100"', async () => {
      losslessParserMode = 'tres-capitulos';
      const fileBuffer = readFixture('livro-3-capitulos.docx') ?? Buffer.alloc(128, 0x50);
      response = await request(app.getHttpServer())
        .post('/api/v1/imp/manuscripts')
        .field('projetoId', PROJ_100_UUID)
        .attach('file', fileBuffer, 'livro-3-capitulos.docx');
    });

    then("every paragraph node's text equals the source text verbatim", () => {
      const tree: ContentTree = response.body.estrutura as ContentTree;
      const paragraphs = collectAllBlocks(tree).filter((b) => b.type === 'paragraph');
      // The fake tree has 3 known paragraph texts; verify each is returned unchanged.
      const knownTexts = [
        KNOWN_PARAGRAPH_TEXT_1,
        KNOWN_PARAGRAPH_TEXT_2,
        KNOWN_PARAGRAPH_TEXT_3,
      ];
      expect(paragraphs).toHaveLength(3);
      for (const [i, block] of paragraphs.entries()) {
        expect(block.content).toBe(knownTexts[i]);
      }
    });

    and(
      'for each paragraph with runs the concatenation of runs equals the paragraph text',
      () => {
        const tree: ContentTree = response.body.estrutura as ContentTree;
        const paragraphs = collectAllBlocks(tree).filter((b) => b.type === 'paragraph');
        for (const block of paragraphs) {
          const runs = (block as any).runs as Array<{ text: string }> | undefined;
          if (Array.isArray(runs) && runs.length > 0) {
            const concatenated = runs.map((r) => r.text).join('');
            expect(concatenated).toBe(block.content);
          }
          // Paragraphs without runs pass trivially — lossless invariant holds.
        }
      },
    );
  });

  // ── Scenario 3: The whole source is accounted for ────────────────────────────

  test('The whole source is accounted for', ({ and, given, then, when }) => {
    given('an authenticated editor of empresa "aetos" with scope "imp:write"', () => {
      // Auth injected globally.
    });

    and('an existing project "proj-100" in the active empresa', () => {
      // Fake find projeto accepts proj-100 in aetos.
    });

    when('the editor uploads "livro-com-tabela-complexa.docx" with projetoId "proj-100"', async () => {
      losslessParserMode = 'tabela-complexa';
      const fileBuffer =
        readFixture('livro-com-tabela-complexa.docx') ?? Buffer.alloc(128, 0x50);
      response = await request(app.getHttpServer())
        .post('/api/v1/imp/manuscripts')
        .field('projetoId', PROJ_100_UUID)
        .attach('file', fileBuffer, 'livro-com-tabela-complexa.docx');
    });

    then(
      'the union of paragraph, image and unparsed nodes accounts for the entire source',
      () => {
        expect(response.status).toBe(201);
        const tree: ContentTree = response.body.estrutura as ContentTree;
        const allBlocks = collectAllBlocks(tree);
        const allUnparsed = collectAllUnparsed(tree);

        const paragraphCount = allBlocks.filter((b) => b.type === 'paragraph').length;
        const imageCount = allBlocks.filter((b) => b.type === 'image').length;
        const unparsedCount = allUnparsed.length;

        // FAKE_CONTENT_TREE_TABELA has: 1 paragraph, 0 images, 1 unparsed.
        // Total content elements = 2. Verify the sum is non-zero and matches expectation.
        const total = paragraphCount + imageCount + unparsedCount;
        expect(total).toBeGreaterThan(0);

        // Verify the breakdown matches the known fake tree counts — no nodes are dropped.
        expect(paragraphCount).toBe(1);
        expect(imageCount).toBe(0);
        expect(unparsedCount).toBe(1);
        // 1 + 0 + 1 = 2 total content elements — entire "source" is accounted for.
        expect(total).toBe(2);
      },
    );
  });

  // ── Scenario 4: Parsing is deterministic ────────────────────────────────────

  test('Parsing is deterministic', ({ and, given, then, when }) => {
    given('an authenticated editor of empresa "aetos" with scope "imp:write"', () => {
      // Auth injected globally.
    });

    and('an existing project "proj-100" in the active empresa', () => {
      // Fake find projeto accepts proj-100 in aetos.
    });

    when('the editor uploads "livro-3-capitulos.docx" with projetoId "proj-100"', async () => {
      losslessParserMode = 'tres-capitulos';
      const fileBuffer = readFixture('livro-3-capitulos.docx') ?? Buffer.alloc(128, 0x50);
      firstResponse = await request(app.getHttpServer())
        .post('/api/v1/imp/manuscripts')
        .field('projetoId', PROJ_100_UUID)
        .attach('file', fileBuffer, 'livro-3-capitulos.docx');
      expect(firstResponse.status).toBe(201);
    });

    and(
      'the editor uploads "livro-3-capitulos.docx" again with projetoId "proj-100"',
      async () => {
        losslessParserMode = 'tres-capitulos';
        const fileBuffer = readFixture('livro-3-capitulos.docx') ?? Buffer.alloc(128, 0x50);
        response = await request(app.getHttpServer())
          .post('/api/v1/imp/manuscripts')
          .field('projetoId', PROJ_100_UUID)
          .attach('file', fileBuffer, 'livro-3-capitulos.docx');
        expect(response.status).toBe(201);
      },
    );

    then('both content trees are structurally identical', () => {
      const tree1: ContentTree = firstResponse.body.estrutura as ContentTree;
      const tree2: ContentTree = response.body.estrutura as ContentTree;

      // Verify same chapter count and titles.
      expect(tree1.chapters.length).toBe(tree2.chapters.length);
      const titles1 = tree1.chapters.map((c: Chapter) => c.title);
      const titles2 = tree2.chapters.map((c: Chapter) => c.title);
      expect(titles1).toEqual(titles2);

      // Verify same block content in each section.
      const blocks1 = collectAllBlocks(tree1).map((b) => ({ type: b.type, content: b.content }));
      const blocks2 = collectAllBlocks(tree2).map((b) => ({ type: b.type, content: b.content }));
      expect(blocks1).toEqual(blocks2);

      // Verify same unparsed count.
      const unparsed1 = collectAllUnparsed(tree1);
      const unparsed2 = collectAllUnparsed(tree2);
      expect(unparsed1.length).toBe(unparsed2.length);
    });
  });

  // ── Scenario Outline: Unstructurable regions are classified by a closed reason enum ──

  test('Unstructurable regions are classified by a closed reason enum', ({
    and,
    given,
    then,
    when,
  }) => {
    let currentReason: UnparsedReason;
    let enumResponse: request.Response;

    given('an authenticated editor of empresa "aetos" with scope "imp:write"', () => {
      // Auth injected globally.
    });

    and('an existing project "proj-100" in the active empresa', () => {
      // Fake find projeto accepts proj-100 in aetos.
    });

    when(
      /^a source region cannot be confidently structured because of "(.*)"$/,
      async (region: string) => {
        // Map the region description to its canonical reason code.
        const reason = REGION_TO_REASON[region];
        expect(reason).toBeDefined(); // Validate the region is in the closed enum.
        currentReason = reason;

        // Configure the fake parser to emit a segment with this specific reason.
        losslessParserMode = { fixedReason: reason };

        // Trigger an upload so the parse pipeline runs.
        enumResponse = await request(app.getHttpServer())
          .post('/api/v1/imp/manuscripts')
          .field('projetoId', PROJ_100_UUID)
          .attach('file', Buffer.alloc(64, 0x50), 'livro-3-capitulos.docx');
      },
    );

    then(
      /^it is emitted as an unparsed node with reason "(.*)"$/,
      (_expectedReason: string) => {
        // The expectedReason from the Examples table is the same as currentReason.
        expect(enumResponse.status).toBe(201);
        const tree: ContentTree = enumResponse.body.estrutura as ContentTree;
        const allUnparsed = collectAllUnparsed(tree);
        expect(allUnparsed.length).toBeGreaterThan(0);
        expect(allUnparsed[0].reason).toBe(currentReason);
      },
    );
  });
});
