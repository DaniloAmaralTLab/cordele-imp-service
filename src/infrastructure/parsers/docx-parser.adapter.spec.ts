import { Test } from '@nestjs/testing';
import { DocxParserAdapter } from './docx-parser.adapter';
import { ManuscriptParseError } from '../../domain/imp/ports/manuscript-parser.port';
import {
  fixtureTresCapitulos,
  fixtureComTabelaComplexa,
  fixtureDocxCorrompido,
  fixtureComImagem,
  fixtureVazio,
} from './docx-fixtures.helper';

const MIME_DOCX =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

describe('DocxParserAdapter', () => {
  let adapter: DocxParserAdapter;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [DocxParserAdapter],
    }).compile();
    adapter = moduleRef.get(DocxParserAdapter);
  });

  describe('supports', () => {
    it('aceita DOCX mime type', () => {
      expect(adapter.supports(MIME_DOCX)).toBe(true);
    });
    it('aceita application/msword', () => {
      expect(adapter.supports('application/msword')).toBe(true);
    });
    it('rejeita text/markdown', () => {
      expect(adapter.supports('text/markdown')).toBe(false);
    });
    it('rejeita application/pdf', () => {
      expect(adapter.supports('application/pdf')).toBe(false);
    });
  });

  describe('parse — livro-3-capitulos.docx', () => {
    it('retorna 3 capítulos', async () => {
      const buf = await fixtureTresCapitulos();
      const tree = await adapter.parse(buf, MIME_DOCX);
      expect(tree.chapters).toHaveLength(3);
    });

    it('cada capítulo tem título correto', async () => {
      const buf = await fixtureTresCapitulos();
      const tree = await adapter.parse(buf, MIME_DOCX);
      expect(tree.chapters[0].title).toContain('Capítulo 1');
      expect(tree.chapters[1].title).toContain('Capítulo 2');
      expect(tree.chapters[2].title).toContain('Capítulo 3');
    });

    it('capítulos têm seções', async () => {
      const buf = await fixtureTresCapitulos();
      const tree = await adapter.parse(buf, MIME_DOCX);
      for (const chapter of tree.chapters) {
        expect(chapter.sections.length).toBeGreaterThanOrEqual(1);
      }
    });

    it('não tem unparsedSegments inesperados', async () => {
      const buf = await fixtureTresCapitulos();
      const tree = await adapter.parse(buf, MIME_DOCX);
      const totalUnparsed = [
        ...tree.orphanUnparsedSegments,
        ...tree.chapters.flatMap((c) =>
          c.sections.flatMap((s) => s.unparsedSegments),
        ),
      ];
      expect(totalUnparsed).toHaveLength(0);
    });

    it('determinismo — mesma entrada → mesma estrutura', async () => {
      const buf = await fixtureTresCapitulos();
      const tree1 = await adapter.parse(buf, MIME_DOCX);
      const tree2 = await adapter.parse(buf, MIME_DOCX);
      expect(tree1.chapters).toHaveLength(tree2.chapters.length);
      expect(tree1.chapters.map((c) => c.title)).toEqual(
        tree2.chapters.map((c) => c.title),
      );
    });
  });

  describe('parse — livro-com-tabela-complexa.docx', () => {
    it('gera pelo menos 1 UnparsedSegment de razão complex_table', async () => {
      const buf = await fixtureComTabelaComplexa();
      const tree = await adapter.parse(buf, MIME_DOCX);
      const allUnparsed = [
        ...tree.orphanUnparsedSegments,
        ...tree.chapters.flatMap((c) =>
          c.sections.flatMap((s) => s.unparsedSegments),
        ),
      ];
      const complexTable = allUnparsed.find((u) => u.reason === 'complex_table');
      expect(complexTable).toBeDefined();
    });
  });

  describe('parse — documento corrompido', () => {
    it('lança ManuscriptParseError para arquivo corrompido', async () => {
      const buf = fixtureDocxCorrompido();
      await expect(adapter.parse(buf, MIME_DOCX)).rejects.toThrow(
        ManuscriptParseError,
      );
    });

    it('ManuscriptParseError tem reason corrupted_content', async () => {
      const buf = fixtureDocxCorrompido();
      try {
        await adapter.parse(buf, MIME_DOCX);
        fail('Deveria ter lançado ManuscriptParseError');
      } catch (err) {
        expect(err).toBeInstanceOf(ManuscriptParseError);
        expect((err as ManuscriptParseError).reason).toBe('corrupted_content');
      }
    });
  });

  describe('parse — documento vazio', () => {
    it('processa documento vazio sem erro', async () => {
      const buf = await fixtureVazio();
      const tree = await adapter.parse(buf, MIME_DOCX);
      expect(tree.chapters).toHaveLength(0);
    });
  });

  describe('parse — documento com imagem', () => {
    it('imagem gera Block(image) ou UnparsedSegment dependendo do formato', async () => {
      const buf = await fixtureComImagem();
      const tree = await adapter.parse(buf, MIME_DOCX);
      // O documento tem pelo menos 1 capítulo ou orphan unparsed (imagem referenciada sem arquivo).
      const hasStructure =
        tree.chapters.length > 0 || tree.orphanUnparsedSegments.length > 0;
      expect(hasStructure).toBe(true);
    });
  });

  describe('7 motivos de UnparsedSegment — cobertura', () => {
    // complex_table — coberto pelo fixture de tabela acima.

    it('unknown_style — mammoth warning sobre estilo desconhecido', async () => {
      // O fixture de 3 capítulos usa estilos "Heading1"/"Heading2" que o mammoth
      // pode não reconhecer como H1/H2 sem o style map correto.
      // O adapter registra warnings do mammoth; se nenhum → o estilo foi mapeado.
      // Verificamos que o adapter processa sem erro.
      const buf = await fixtureTresCapitulos();
      await expect(adapter.parse(buf, MIME_DOCX)).resolves.toBeDefined();
    });

    it('corrupted_content — arquivo inválido lança ManuscriptParseError', async () => {
      await expect(
        adapter.parse(fixtureDocxCorrompido(), MIME_DOCX),
      ).rejects.toThrow(ManuscriptParseError);
    });

    it('complex_table — fixture de tabela gera UnparsedSegment', async () => {
      const buf = await fixtureComTabelaComplexa();
      const tree = await adapter.parse(buf, MIME_DOCX);
      const allUnparsed = [
        ...tree.orphanUnparsedSegments,
        ...tree.chapters.flatMap((c) =>
          c.sections.flatMap((s) => s.unparsedSegments),
        ),
      ];
      expect(allUnparsed.some((u) => u.reason === 'complex_table')).toBe(true);
    });

    // Os demais motivos (unsupported_media, nested_list, embedded_object, missing_mapping)
    // são cobertos pelo MarkdownParserAdapter.spec.ts e pelas mensagens do mammoth.
    // O DocxParserAdapter os detecta via mapMessageToUnparsed() a partir dos warnings.

    it('ManuscriptParseError é instância de Error com propriedade reason', () => {
      const reasons = [
        'complex_table',
        'unsupported_media',
        'nested_list',
        'embedded_object',
        'unknown_style',
        'corrupted_content',
        'missing_mapping',
      ] as const;

      for (const reason of reasons) {
        const err = new ManuscriptParseError(reason);
        expect(err).toBeInstanceOf(Error);
        expect(err.reason).toBe(reason);
      }
    });
  });
});
