import { Manuscrito } from '../../../domain/imp/manuscrito.entity';
import type { ContentTree } from '../../../domain/imp/content-tree';
import {
  SegmentoNaoEncontradoError,
  ManuscritoNaoEncontradoError,
} from '../../../domain/imp/errors';
import { SegmentoCuradoria } from '../../../domain/imp/segmento-curadoria.entity';
import { IgnoreSegmentUseCase } from './ignore-segment.use-case';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const makeContentTree = (blockId = 'blk1'): ContentTree => ({
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
          blocks: [{ id: blockId, type: 'paragraph', content: 'Hello', order: 1 }],
          unparsedSegments: [],
        },
      ],
    },
  ],
  orphanUnparsedSegments: [],
});

const makeManuscrito = (estrutura: ContentTree = makeContentTree()): Manuscrito =>
  Manuscrito.create({
    id: 'ms-001',
    projetoId: 'proj-001',
    empresaId: 'aetos',
    filename: 'test.docx',
    mimeType: DOCX_MIME,
    storageKey: 'emp_aetos/ms-001/test.docx',
    estrutura,
  });

describe('IgnoreSegmentUseCase', () => {
  let manuscritoRepo: jest.Mocked<import('../../../domain/imp/ports/manuscrito-repository.port').ManuscritoRepositoryPort>;
  let segmentoCuradoriaRepo: jest.Mocked<import('../../../domain/imp/ports/segmento-curadoria-repository.port').SegmentoCuradoriaRepositoryPort>;
  let useCase: IgnoreSegmentUseCase;

  beforeEach(() => {
    manuscritoRepo = {
      save: jest.fn(),
      findById: jest.fn(),
      findByProjetoId: jest.fn(),
    };
    segmentoCuradoriaRepo = {
      save: jest.fn(),
      findByManuscritoAndSegmento: jest.fn(),
    };
    useCase = new IgnoreSegmentUseCase(manuscritoRepo, segmentoCuradoriaRepo);
  });

  describe('ignore — happy path', () => {
    it('should save SegmentoCuradoria IGNORADO when segmentoId pertence ao manuscrito', async () => {
      const ms = makeManuscrito();
      manuscritoRepo.findById.mockResolvedValue(ms);
      segmentoCuradoriaRepo.save.mockImplementation(async (s) => s);

      await useCase.ignore({ manuscritoId: 'ms-001', segmentoId: 'blk1', empresaId: 'aetos' });

      expect(segmentoCuradoriaRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'IGNORADO', segmentoId: 'blk1' }),
        'aetos',
      );
    });
  });

  describe('ignore — segmentoId inválido', () => {
    it('should throw SegmentoNaoEncontradoError when segmentoId não pertence ao manuscrito', async () => {
      const ms = makeManuscrito();
      manuscritoRepo.findById.mockResolvedValue(ms);

      await expect(
        useCase.ignore({ manuscritoId: 'ms-001', segmentoId: 'inexistente', empresaId: 'aetos' }),
      ).rejects.toThrow(SegmentoNaoEncontradoError);

      expect(segmentoCuradoriaRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('ignore — manuscrito não encontrado', () => {
    it('should throw ManuscritoNaoEncontradoError when manuscrito não existe', async () => {
      manuscritoRepo.findById.mockResolvedValue(null);

      await expect(
        useCase.ignore({ manuscritoId: 'ms-999', segmentoId: 'blk1', empresaId: 'aetos' }),
      ).rejects.toThrow(ManuscritoNaoEncontradoError);
    });
  });

  describe('ignore — idempotente', () => {
    it('should save again (upsert semantics) when segmento já ignorado', async () => {
      const ms = makeManuscrito();
      const existing = SegmentoCuradoria.ignore('ms-001', 'blk1', 'primeiro ignore');
      manuscritoRepo.findById.mockResolvedValue(ms);
      segmentoCuradoriaRepo.save.mockImplementation(async (s) => s);
      // Chamar duas vezes não deve lançar
      await useCase.ignore({ manuscritoId: 'ms-001', segmentoId: 'blk1', empresaId: 'aetos' });
      await useCase.ignore({ manuscritoId: 'ms-001', segmentoId: 'blk1', motivo: 'segundo ignore', empresaId: 'aetos' });

      expect(segmentoCuradoriaRepo.save).toHaveBeenCalledTimes(2);
      // Ambos salvos como IGNORADO
      expect(segmentoCuradoriaRepo.save).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ status: 'IGNORADO' }),
        'aetos',
      );
      expect(existing).toBeTruthy();
    });
  });

  describe('restore — happy path', () => {
    it('should save SegmentoCuradoria ATIVO when restoring', async () => {
      const ms = makeManuscrito();
      manuscritoRepo.findById.mockResolvedValue(ms);
      segmentoCuradoriaRepo.save.mockImplementation(async (s) => s);

      await useCase.restore({ manuscritoId: 'ms-001', segmentoId: 'blk1', empresaId: 'aetos' });

      expect(segmentoCuradoriaRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'ATIVO', segmentoId: 'blk1' }),
        'aetos',
      );
    });
  });

  describe('restore — segmentoId inválido', () => {
    it('should throw SegmentoNaoEncontradoError when segmentoId inválido', async () => {
      const ms = makeManuscrito();
      manuscritoRepo.findById.mockResolvedValue(ms);

      await expect(
        useCase.restore({ manuscritoId: 'ms-001', segmentoId: 'nope', empresaId: 'aetos' }),
      ).rejects.toThrow(SegmentoNaoEncontradoError);
    });
  });

  describe('restore com unparsedSegment', () => {
    it('should restore successfully for unparsedSegment', async () => {
      const treeWithUnparsed: ContentTree = {
        chapters: [],
        orphanUnparsedSegments: [
          { id: 'orp1', reason: 'complex_table', rawContent: '...', order: 1 },
        ],
      };
      const ms = makeManuscrito(treeWithUnparsed);
      manuscritoRepo.findById.mockResolvedValue(ms);
      segmentoCuradoriaRepo.save.mockImplementation(async (s) => s);

      await useCase.restore({ manuscritoId: 'ms-001', segmentoId: 'orp1', empresaId: 'aetos' });
      expect(segmentoCuradoriaRepo.save).toHaveBeenCalled();
    });
  });
});
