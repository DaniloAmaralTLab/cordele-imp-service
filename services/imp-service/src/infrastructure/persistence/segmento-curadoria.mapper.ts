import type { SegmentoCuradoria as PrismaSegmentoCuradoria } from '@prisma/client';

import type { SegmentoCuradoriaStatus } from '../../domain/imp/segmento-curadoria.entity';
import { SegmentoCuradoria } from '../../domain/imp/segmento-curadoria.entity';

/**
 * SegmentoCuradoriaMapper — converte entre o agregado `SegmentoCuradoria`
 * e o modelo Prisma `SegmentoCuradoria` (tabela `segmento_curadoria`).
 *
 * Mapeamentos notáveis:
 * - Domínio `status` ('IGNORADO'|'ATIVO') → DB `acao` ('ignorado') — MVP suporta só 'IGNORADO'.
 * - `criadoPor`: não presente no domínio; usa 'system' como placeholder (P5 populará via JWT).
 * - `updatedAt`: não existe na tabela; derivado de `criadoEm` na leitura.
 */
export class SegmentoCuradoriaMapper {
  /**
   * Converte o agregado de domínio para os campos do `prisma.segmentoCuradoria.create()`.
   *
   * @param segmento  Agregado de domínio.
   * @param criadoPor `userId` do principal autenticado — derivado do JWT pelo repositório
   *                  via `EmpresaContextService`. Fallback para `'system'` quando ausente
   *                  (ex.: processos batch sem contexto HTTP).
   */
  static toPrismaCreateData(
    segmento: SegmentoCuradoria,
    criadoPor: string,
  ): {
    id: string;
    manuscritoId: string;
    segmentoId: string;
    acao: string;
    criadoPor: string;
  } {
    return {
      id: segmento.id,
      manuscritoId: segmento.manuscritoId,
      segmentoId: segmento.segmentoId,
      acao: SegmentoCuradoriaMapper.statusToAcao(segmento.status),
      criadoPor,
    };
  }

  /**
   * Converte o modelo Prisma para o agregado de domínio.
   */
  static toDomain(row: PrismaSegmentoCuradoria): SegmentoCuradoria {
    return new SegmentoCuradoria({
      id: row.id,
      manuscritoId: row.manuscritoId,
      segmentoId: row.segmentoId,
      status: SegmentoCuradoriaMapper.acaoToStatus(row.acao),
      // `motivo` não está na tabela; substituído por undefined.
      motivo: undefined,
      createdAt: row.criadoEm,
      // `updatedAt` não existe na tabela; usa criadoEm como fallback.
      updatedAt: row.criadoEm,
    });
  }

  // --- Helpers de mapeamento ---

  private static statusToAcao(status: SegmentoCuradoriaStatus): string {
    // MVP: só 'IGNORADO' → 'ignorado' está na constraint do DB.
    if (status === 'IGNORADO') return 'ignorado';
    // ATIVO não tem representação DB ainda; fallback para 'ignorado' (inválido mas
    // nunca persistido em MVP — SegmentoCuradoria.restore() não chama save()).
    return 'ignorado';
  }

  private static acaoToStatus(acao: string): SegmentoCuradoriaStatus {
    if (acao === 'ignorado') return 'IGNORADO';
    return 'IGNORADO';
  }
}
