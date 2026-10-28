import { Manuscrito } from './manuscrito.entity';
import type { ContentTree } from './content-tree';

/**
 * Testes do agregado Manuscrito.
 *
 * Verifica criação, campos obrigatórios e método hasSegmento.
 */
describe('Manuscrito', () => {
  const emptyTree: ContentTree = {
    chapters: [],
    orphanUnparsedSegments: [],
  };

  const baseProps = {
    id: 'manu-001',
    projetoId: 'proj-001',
    empresaId: 'aetos',
    filename: 'livro.docx',
    mimeType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document' as const,
    storageKey: 'emp_aetos/manu-001/livro.docx',
    estrutura: emptyTree,
  };

  describe('Manuscrito.create()', () => {
    it('should create a Manuscrito with imported status (synchronous parse)', () => {
      const m = Manuscrito.create(baseProps);
      expect(m.status).toBe('imported');
    });

    it('should assign createdAt automatically', () => {
      const before = new Date();
      const m = Manuscrito.create(baseProps);
      const after = new Date();
      expect(m.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(m.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should copy all props correctly', () => {
      const m = Manuscrito.create(baseProps);
      expect(m.id).toBe(baseProps.id);
      expect(m.projetoId).toBe(baseProps.projetoId);
      expect(m.empresaId).toBe(baseProps.empresaId);
      expect(m.filename).toBe(baseProps.filename);
      expect(m.mimeType).toBe(baseProps.mimeType);
      expect(m.storageKey).toBe(baseProps.storageKey);
    });
  });

  describe('hasSegmento()', () => {
    it('should return false when estrutura is empty', () => {
      const m = Manuscrito.create(baseProps);
      expect(m.hasSegmento('seg-001')).toBe(false);
    });

    it('should return true for a block id inside a chapter/section', () => {
      const tree: ContentTree = {
        chapters: [
          {
            id: 'chap-1',
            title: 'Capítulo 1',
            order: 1,
            sections: [
              {
                id: 'sec-1',
                title: 'Seção 1',
                order: 1,
                blocks: [
                  { id: 'seg-001', type: 'paragraph', content: 'texto', order: 1 },
                ],
                unparsedSegments: [],
              },
            ],
          },
        ],
        orphanUnparsedSegments: [],
      };
      const m = Manuscrito.create({ ...baseProps, estrutura: tree });
      expect(m.hasSegmento('seg-001')).toBe(true);
    });

    it('should return true for an orphan UnparsedSegment', () => {
      const tree: ContentTree = {
        chapters: [],
        orphanUnparsedSegments: [
          { id: 'seg-999', reason: 'complex_table', rawContent: '...', order: 1 },
        ],
      };
      const m = Manuscrito.create({ ...baseProps, estrutura: tree });
      expect(m.hasSegmento('seg-999')).toBe(true);
    });

    it('should return false for an unknown id', () => {
      const tree: ContentTree = {
        chapters: [
          {
            id: 'chap-1',
            title: 'Cap 1',
            order: 1,
            sections: [
              {
                id: 'sec-1',
                title: 'Sec 1',
                order: 1,
                blocks: [
                  { id: 'seg-001', type: 'paragraph', content: 'x', order: 1 },
                ],
                unparsedSegments: [],
              },
            ],
          },
        ],
        orphanUnparsedSegments: [],
      };
      const m = Manuscrito.create({ ...baseProps, estrutura: tree });
      expect(m.hasSegmento('seg-UNKNOWN')).toBe(false);
    });
  });
});
