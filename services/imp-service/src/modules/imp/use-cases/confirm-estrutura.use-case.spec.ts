import { Manuscrito } from '../../../domain/imp/manuscrito.entity';
import type { ContentTree } from '../../../domain/imp/content-tree';
import {
  ManuscritoNaoEncontradoError,
  ProjetoIntegrationError,
} from '../../../domain/imp/errors';
import { ConfirmEstruturaUseCase } from './confirm-estrutura.use-case';

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

const makeManuscrito = (): Manuscrito =>
  Manuscrito.create({
    id: 'ms-001',
    projetoId: 'proj-001',
    empresaId: 'aetos',
    filename: 'test.docx',
    mimeType: DOCX_MIME,
    storageKey: 'emp_aetos/ms-001/test.docx',
    estrutura: makeContentTree(),
  });

describe('ConfirmEstruturaUseCase', () => {
  let manuscritoRepo: jest.Mocked<import('../../../domain/imp/ports/manuscrito-repository.port').ManuscritoRepositoryPort>;
  let advanceProjeto: jest.Mocked<import('../../../domain/imp/ports/proj-port').AdvanceProjetoStatusPort>;
  let useCase: ConfirmEstruturaUseCase;

  beforeEach(() => {
    manuscritoRepo = {
      save: jest.fn(),
      findById: jest.fn(),
      findByProjetoId: jest.fn(),
      deleteByProjetoId: jest.fn(),
    };
    advanceProjeto = {
      advance: jest.fn(),
    };
    useCase = new ConfirmEstruturaUseCase(manuscritoRepo, advanceProjeto);
  });

  describe('sucesso', () => {
    it('should advance projeto status to COMPOSICAO', async () => {
      manuscritoRepo.findById.mockResolvedValue(makeManuscrito());
      advanceProjeto.advance.mockResolvedValue(undefined);

      await useCase.execute({ manuscritoId: 'ms-001', empresaId: 'aetos' });

      expect(advanceProjeto.advance).toHaveBeenCalledWith(
        expect.objectContaining({
          projetoId: 'proj-001',
          targetStatus: 'COMPOSICAO',
          empresaId: 'aetos',
        }),
      );
    });
  });

  describe('idempotente', () => {
    it('should not throw on second call when port is idempotent', async () => {
      manuscritoRepo.findById.mockResolvedValue(makeManuscrito());
      advanceProjeto.advance.mockResolvedValue(undefined);

      await useCase.execute({ manuscritoId: 'ms-001', empresaId: 'aetos' });
      await expect(
        useCase.execute({ manuscritoId: 'ms-001', empresaId: 'aetos' }),
      ).resolves.toBeUndefined();

      expect(advanceProjeto.advance).toHaveBeenCalledTimes(2);
    });
  });

  describe('manuscrito não encontrado', () => {
    it('should throw ManuscritoNaoEncontradoError when manuscrito não existe', async () => {
      manuscritoRepo.findById.mockResolvedValue(null);

      await expect(
        useCase.execute({ manuscritoId: 'ms-999', empresaId: 'aetos' }),
      ).rejects.toThrow(ManuscritoNaoEncontradoError);
      expect(advanceProjeto.advance).not.toHaveBeenCalled();
    });
  });

  describe('falha no PROJ → erro mapeado', () => {
    it('should throw ProjetoIntegrationError when advanceProjeto fails', async () => {
      manuscritoRepo.findById.mockResolvedValue(makeManuscrito());
      advanceProjeto.advance.mockRejectedValue(new Error('PROJ service down'));

      await expect(
        useCase.execute({ manuscritoId: 'ms-001', empresaId: 'aetos' }),
      ).rejects.toThrow(ProjetoIntegrationError);
    });
  });
});
