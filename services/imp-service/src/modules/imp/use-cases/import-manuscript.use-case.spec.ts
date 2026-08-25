import { ManuscriptParseError } from '../../../domain/imp/ports/manuscript-parser.port';
import { Manuscrito } from '../../../domain/imp/manuscrito.entity';
import type { ContentTree } from '../../../domain/imp/content-tree';
import { ManuscritoDetailDto } from '../dto/manuscrito-detail.dto';
import {
  ImportManuscriptUseCase,
  type ImportManuscriptCommand,
} from './import-manuscript.use-case';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

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
  let eventBus: jest.Mocked<import('../../../domain/imp/ports/event-bus.port').IEventBus>;
  let useCase: ImportManuscriptUseCase;

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
      supports: jest.fn(),
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
    eventBus = {
      publish: jest.fn(),
    };

    useCase = new ImportManuscriptUseCase(
      parser,
      fileStorage,
      manuscritoRepo,
      createProjeto,
      eventBus,
    );
  });

  describe('happy path', () => {
    it('should parse, store, save, bind project, emit event and return DTO', async () => {
      const tree = makeContentTree();
      const ms = makeManuscrito();

      parser.supports.mockReturnValue(true);
      parser.parse.mockResolvedValue(tree);
      fileStorage.store.mockResolvedValue('emp_aetos/ms-001/test.docx');
      manuscritoRepo.save.mockResolvedValue(ms);
      createProjeto.create.mockResolvedValue({ projetoId: 'proj-stub-ms-001' });
      eventBus.publish.mockResolvedValue(undefined);

      const result = await useCase.execute(baseCommand);

      expect(parser.supports).toHaveBeenCalledWith(DOCX_MIME);
      expect(parser.parse).toHaveBeenCalledWith(baseCommand.fileBuffer, DOCX_MIME);
      expect(fileStorage.store).toHaveBeenCalled();
      expect(manuscritoRepo.save).toHaveBeenCalled();
      expect(createProjeto.create).toHaveBeenCalled();
      expect(eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({ eventName: 'ManuscriptImported' }),
      );
      expect(result).toBeInstanceOf(ManuscritoDetailDto);
      expect(result.empresaId).toBe('aetos');
    });
  });

  describe('unsupported mime type', () => {
    it('should emit ManuscriptImportRejected and throw ManuscriptParseError', async () => {
      parser.supports.mockReturnValue(false);
      eventBus.publish.mockResolvedValue(undefined);

      await expect(useCase.execute({ ...baseCommand, mimeType: 'text/plain' })).rejects.toThrow(
        ManuscriptParseError,
      );
      expect(eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({ eventName: 'ManuscriptImportRejected' }),
      );
      expect(manuscritoRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('parse rejection', () => {
    it('should emit ManuscriptImportRejected and rethrow when parser throws', async () => {
      parser.supports.mockReturnValue(true);
      parser.parse.mockRejectedValue(new ManuscriptParseError('corrupted', undefined));
      eventBus.publish.mockResolvedValue(undefined);

      await expect(useCase.execute(baseCommand)).rejects.toThrow(ManuscriptParseError);
      expect(eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({ eventName: 'ManuscriptImportRejected' }),
      );
      expect(manuscritoRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('PROJ integration failure', () => {
    it('should throw ProjetoIntegrationError when createProjeto fails', async () => {
      const tree = makeContentTree();
      const ms = makeManuscrito();

      parser.supports.mockReturnValue(true);
      parser.parse.mockResolvedValue(tree);
      fileStorage.store.mockResolvedValue('emp_aetos/ms-001/test.docx');
      manuscritoRepo.save.mockResolvedValue(ms);
      createProjeto.create.mockRejectedValue(new Error('PROJ unavailable'));
      eventBus.publish.mockResolvedValue(undefined);

      await expect(useCase.execute(baseCommand)).rejects.toThrow('Falha na integração com PROJ');
    });
  });

  describe('unparsed segments', () => {
    it('should import successfully even when orphanUnparsedSegments exist', async () => {
      const tree: ContentTree = {
        chapters: [],
        orphanUnparsedSegments: [
          { id: 'orp1', reason: 'complex_table', rawContent: '...', order: 1 },
        ],
      };
      const ms = makeManuscrito();

      parser.supports.mockReturnValue(true);
      parser.parse.mockResolvedValue(tree);
      fileStorage.store.mockResolvedValue('key');
      manuscritoRepo.save.mockResolvedValue(ms);
      createProjeto.create.mockResolvedValue({ projetoId: 'proj-001' });
      eventBus.publish.mockResolvedValue(undefined);

      const result = await useCase.execute(baseCommand);
      expect(result).toBeInstanceOf(ManuscritoDetailDto);
    });
  });
});
