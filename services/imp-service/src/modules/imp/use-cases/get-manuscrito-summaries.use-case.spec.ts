import { MANUSCRITO_REPOSITORY_PORT } from '../../../domain/imp/ports/manuscrito-repository.port';
import type { ManuscritoRepositoryPort, ManuscritoSummaryRecord } from '../../../domain/imp/ports/manuscrito-repository.port';
import { GetManuscritoSummariesUseCase } from './get-manuscrito-summaries.use-case';

describe('GetManuscritoSummariesUseCase', () => {
  let useCase: GetManuscritoSummariesUseCase;
  let repoMock: jest.Mocked<Pick<ManuscritoRepositoryPort, 'findSummariesByProjetoIds'>>;

  beforeEach(() => {
    repoMock = {
      findSummariesByProjetoIds: jest.fn(),
    };

    useCase = new GetManuscritoSummariesUseCase(repoMock as unknown as ManuscritoRepositoryPort);

    // Suppress DI token unused warning — token is used to bind in module
    void MANUSCRITO_REPOSITORY_PORT;
  });

  it('returns [] immediately for empty projetoIds without calling repo', async () => {
    const result = await useCase.execute({ projetoIds: [], empresaId: 'aetos' });
    expect(result).toEqual([]);
    expect(repoMock.findSummariesByProjetoIds).not.toHaveBeenCalled();
  });

  it('delegates to repo and returns summaries for known projetoIds', async () => {
    const expected: ManuscritoSummaryRecord[] = [
      { projetoId: 'proj-1', totalCapitulos: 5, totalImagens: 2 },
      { projetoId: 'proj-2', totalCapitulos: 10, totalImagens: 0 },
    ];
    repoMock.findSummariesByProjetoIds.mockResolvedValue(expected);

    const result = await useCase.execute({
      projetoIds: ['proj-1', 'proj-2'],
      empresaId: 'aetos',
    });

    expect(result).toEqual(expected);
    expect(repoMock.findSummariesByProjetoIds).toHaveBeenCalledWith(
      ['proj-1', 'proj-2'],
      'aetos',
    );
  });

  it('omits projetos without manuscrito (repo returns empty for unknown projetoId)', async () => {
    repoMock.findSummariesByProjetoIds.mockResolvedValue([
      { projetoId: 'proj-known', totalCapitulos: 3, totalImagens: 1 },
    ]);

    const result = await useCase.execute({
      projetoIds: ['proj-known', 'proj-unknown'],
      empresaId: 'aetos',
    });

    expect(result).toHaveLength(1);
    expect(result[0].projetoId).toBe('proj-known');
  });

  it('passes empresaId correctly to the repository', async () => {
    repoMock.findSummariesByProjetoIds.mockResolvedValue([]);
    await useCase.execute({ projetoIds: ['proj-1'], empresaId: 'editora-beta' });
    expect(repoMock.findSummariesByProjetoIds).toHaveBeenCalledWith(
      expect.any(Array),
      'editora-beta',
    );
  });
});
