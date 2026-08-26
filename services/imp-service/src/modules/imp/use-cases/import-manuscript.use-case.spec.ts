import {
  ArquivoGrandeDemaisError,
  FormatoNaoSuportadoError,
  ProjectBindingInvalidError,
  ProjetoNaoEncontradoError,
} from '../../../domain/imp/errors';
import { ManuscriptParseError } from '../../../domain/imp/ports/manuscript-parser.port';
import { Manuscrito } from '../../../domain/imp/manuscrito.entity';
import type { ContentTree } from '../../../domain/imp/content-tree';
import type { FindProjetoPort } from '../../../domain/imp/ports/find-projeto.port';
import { ManuscritoDetailDto } from '../dto/manuscrito-detail.dto';
import {
  ImportManuscriptUseCase,
  type ImportManuscriptCommand,
} from './import-manuscript.use-case';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const MARKDOWN_MIME = 'text/markdown';

const makeContentTree = (): ContentTree => ({
  chapters: [
    {
      id: 'ch1',
      title: 'Capítulo 1',
      order: 1,
      sections: [
        {
          id: 'sec1',
          title: 'Seção 1',
          order: 1,
          blocks: [{ id: 'blk1', type: 'paragraph', content: 'Hello', order: 1 }],
          unparsedSegments: [],
        },
      ],
    },
  ],
  orphanUnparsedSegments: [],
});

const makeManuscrito = (id = 'ms-001'): Manuscrito =>
  Manuscrito.create({
    id,
    projetoId: 'proj-001',
    empresaId: 'aetos',
    filename: 'test.docx',
    mimeType: DOCX_MIME,
    storageKey: `emp_aetos/${id}/test.docx`,
    estrutura: makeContentTree(),
  });

describe('ImportManuscriptUseCase', () => {
  let parser: jest.Mocked<import('../../../domain/imp/ports/manuscript-parser.port').ManuscriptParserPort>;
  let fileStorage: jest.Mocked<import('../../../domain/imp/ports/file-storage.port').FileStoragePort>;
  let manuscritoRepo: jest.Mocked<import('../../../domain/imp/ports/manuscrito-repository.port').ManuscritoRepositoryPort>;
  let createProjeto: jest.Mocked<import('../../../domain/imp/ports/proj-port').CreateProjetoEditorialPort>;
  let findProjeto: jest.Mocked<FindProjetoPort>;
  let eventBus: jest.Mocked<import('../../../domain/imp/ports/event-bus.port').IEventBus>;
  let useCase: ImportManuscriptUseCase;

  /** Base command with projetoId only (existing project). */
  const baseCommand: ImportManuscriptCommand = {
    projetoId: 'proj-001',
    filename: 'test.docx',
    mimeType: DOCX_MIME,
    fileBuffer: Buffer.from('fake-content'),
    empresaId: 'aetos',
  };

  beforeEach(() => {
    parser = {
      parse: jest.fn(),
      supports: jest.fn().mockReturnValue(true),
    };
    fileStorage = {
      store: jest.fn(),
      retrieve: jest.fn(),
      delete: jest.fn(),
    };
    manuscritoRepo = {
      save: jest.fn(),
      findById: jest.fn(),
      findByProjetoId: jest.fn(),
    };
    createProjeto = {
      create: jest.fn(),
    };
    findProjeto = {
      findById: jest.fn(),
    };
    eventBus = {
      publish: jest.fn(),
    };

    useCase = new ImportManuscriptUseCase(
      parser,
      fileStorage,
      manuscritoRepo,
      createProjeto,
      findProjeto,
      eventBus,
    );
  });

  // ── happy path (projetoId existing) ─────────────────────────────────────────

  describe('happy path — projetoId (existing project)', () => {
    it('should parse, store, save, emit event and return DTO', async () => {
      const tree = makeContentTree();
      const ms = makeManuscrito();

      parser.parse.mockResolvedValue(tree);
      fileStorage.store.mockResolvedValue('emp_aetos/ms-001/test.docx');
      manuscritoRepo.save.mockResolvedValue(ms);
      findProjeto.findById.mockResolvedValue({ projetoId: 'proj-001' });
      eventBus.publish.mockResolvedValue(undefined);

      const result = await useCase.execute(baseCommand);

      expect(findProjeto.findById).toHaveBeenCalledWith('proj-001', 'aetos');
      expect(parser.parse).toHaveBeenCalledWith(baseCommand.fileBuffer, DOCX_MIME);
      expect(fileStorage.store).toHaveBeenCalled();
      expect(manuscritoRepo.save).toHaveBeenCalled();
      expect(createProjeto.create).not.toHaveBeenCalled();
      expect(eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({ eventName: 'ManuscriptImported' }),
      );
      expect(result).toBeInstanceOf(ManuscritoDetailDto);
      expect(result.status).toBe('imported');
    });
  });

  // ── happy path (projetoTitulo — create-and-upload) ──────────────────────────

  describe('happy path — projetoTitulo (create-and-upload)', () => {
    it('should call createProjeto and NOT findProjeto', async () => {
      const tree = makeContentTree();
      const ms = makeManuscrito();

      parser.parse.mockResolvedValue(tree);
      fileStorage.store.mockResolvedValue('key');
      manuscritoRepo.save.mockResolvedValue(ms);
      createProjeto.create.mockResolvedValue({ projetoId: 'new-proj-id' });
      eventBus.publish.mockResolvedValue(undefined);

      const result = await useCase.execute({
        ...baseCommand,
        projetoId: undefined,
        projetoTitulo: 'Novo Livro',
        filename: 'novo.md',
      });

      expect(createProjeto.create).toHaveBeenCalledWith(
        expect.objectContaining({ titulo: 'Novo Livro', empresaId: 'aetos' }),
      );
      expect(findProjeto.findById).not.toHaveBeenCalled();
      expect(result).toBeInstanceOf(ManuscritoDetailDto);
    });
  });

  // ── size validation (413) ────────────────────────────────────────────────────

  describe('file size validation', () => {
    it('should throw ArquivoGrandeDemaisError when file exceeds 50 MiB', async () => {
      const largeBuffer = Buffer.alloc(52_428_801);
      await expect(
        useCase.execute({ ...baseCommand, fileBuffer: largeBuffer }),
      ).rejects.toBeInstanceOf(ArquivoGrandeDemaisError);
      expect(manuscritoRepo.save).not.toHaveBeenCalled();
    });
  });

  // ── format validation (415) ──────────────────────────────────────────────────

  describe('format validation', () => {
    it('should throw FormatoNaoSuportadoError for PDF filename', async () => {
      await expect(
        useCase.execute({ ...baseCommand, filename: 'livro.pdf' }),
      ).rejects.toBeInstanceOf(FormatoNaoSuportadoError);
      expect(manuscritoRepo.save).not.toHaveBeenCalled();
    });

    it('should throw FormatoNaoSuportadoError for unsupported extension', async () => {
      await expect(
        useCase.execute({ ...baseCommand, filename: 'livro.txt' }),
      ).rejects.toBeInstanceOf(FormatoNaoSuportadoError);
    });
  });

  // ── project binding validation (400) ────────────────────────────────────────

  describe('project binding validation', () => {
    it('should throw ProjectBindingInvalidError when neither projetoId nor projetoTitulo', async () => {
      await expect(
        useCase.execute({ ...baseCommand, projetoId: undefined, projetoTitulo: undefined }),
      ).rejects.toBeInstanceOf(ProjectBindingInvalidError);
    });

    it('should throw ProjectBindingInvalidError when both projetoId and projetoTitulo', async () => {
      await expect(
        useCase.execute({ ...baseCommand, projetoTitulo: 'X' }),
      ).rejects.toBeInstanceOf(ProjectBindingInvalidError);
    });
  });

  // ── project not found (422) ──────────────────────────────────────────────────

  describe('projeto not found', () => {
    it('should throw ProjetoNaoEncontradoError when projetoId not in active empresa', async () => {
      findProjeto.findById.mockResolvedValue(null);
      await expect(useCase.execute(baseCommand)).rejects.toBeInstanceOf(
        ProjetoNaoEncontradoError,
      );
      expect(manuscritoRepo.save).not.toHaveBeenCalled();
    });
  });

  // ── parse rejection (422) ────────────────────────────────────────────────────

  describe('parse rejection', () => {
    it('should emit ManuscriptImportRejected and rethrow when parser throws', async () => {
      findProjeto.findById.mockResolvedValue({ projetoId: 'proj-001' });
      parser.parse.mockRejectedValue(new ManuscriptParseError('corrupted', undefined));
      eventBus.publish.mockResolvedValue(undefined);

      await expect(useCase.execute(baseCommand)).rejects.toThrow(ManuscriptParseError);
      expect(eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({ eventName: 'ManuscriptImportRejected' }),
      );
      expect(manuscritoRepo.save).not.toHaveBeenCalled();
    });
  });

  // ── unparsed segments are preserved ─────────────────────────────────────────

  describe('unparsed segments', () => {
    it('should import successfully even when orphanUnparsedSegments exist', async () => {
      const tree: ContentTree = {
        chapters: [],
        orphanUnparsedSegments: [
          { id: 'orp1', reason: 'complex_table', rawContent: '...', order: 1 },
        ],
      };
      const ms = makeManuscrito();

      findProjeto.findById.mockResolvedValue({ projetoId: 'proj-001' });
      parser.parse.mockResolvedValue(tree);
      fileStorage.store.mockResolvedValue('key');
      manuscritoRepo.save.mockResolvedValue(ms);
      eventBus.publish.mockResolvedValue(undefined);

      const result = await useCase.execute(baseCommand);
      expect(result).toBeInstanceOf(ManuscritoDetailDto);
    });
  });

  // ── markdown files ───────────────────────────────────────────────────────────

  describe('markdown files', () => {
    it('should accept .md files and pass text/markdown mime to parser', async () => {
      const tree = makeContentTree();
      const ms = Manuscrito.create({
        id: 'ms-md-1',
        projetoId: 'proj-001',
        empresaId: 'aetos',
        filename: 'livro.md',
        mimeType: MARKDOWN_MIME,
        storageKey: 'key',
        estrutura: tree,
      });

      findProjeto.findById.mockResolvedValue({ projetoId: 'proj-001' });
      parser.parse.mockResolvedValue(tree);
      fileStorage.store.mockResolvedValue('key');
      manuscritoRepo.save.mockResolvedValue(ms);
      eventBus.publish.mockResolvedValue(undefined);

      const result = await useCase.execute({
        ...baseCommand,
        filename: 'livro.md',
        mimeType: MARKDOWN_MIME,
      });

      expect(parser.parse).toHaveBeenCalledWith(baseCommand.fileBuffer, MARKDOWN_MIME);
      expect(result).toBeInstanceOf(ManuscritoDetailDto);
    });
  });
});
