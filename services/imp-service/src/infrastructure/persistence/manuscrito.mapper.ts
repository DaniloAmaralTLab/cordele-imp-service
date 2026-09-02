import type { Manuscrito as PrismaManuscrito } from '../prisma-client';
import { Prisma } from '../prisma-client';

import type { ContentTree } from '../../domain/imp/content-tree';
import type { ManuscritoMimeType, ManuscritoStatus } from '../../domain/imp/manuscrito.entity';
import { Manuscrito } from '../../domain/imp/manuscrito.entity';

/**
 * ManuscritoMapper — converte entre o agregado de domínio `Manuscrito`
 * e o modelo Prisma `Manuscrito` (tabela `manuscrito`).
 *
 * RULE-01: domínio não importa @prisma/client; o mapper vive em infrastructure.
 * O mapper é o único ponto de transformação entre as duas representações.
 */
export class ManuscritoMapper {
  /**
   * Converte o agregado de domínio para os campos necessários ao `prisma.manuscrito.create()`.
   *
   * Notas de mapeamento:
   * - `empresaId` é roteado via `SET LOCAL search_path` (schema-per-tenant), não é coluna.
   * - `tamanhoBytes`: DB constraint exige > 0. Valor real fornecido pelo FileStorage (P4).
   * - `status`: MVP usa 'imported' como estado terminal pós-importação.
   * - `totalCapitulos/Imagens/trechosNaoParseados`: derivados da ContentTree.
   */
  static toPrismaCreateData(manuscrito: Manuscrito): {
    id: string;
    projetoId: string;
    nomeArquivo: string;
    formato: string;
    status: string;
    totalCapitulos: number;
    totalImagens: number;
    trechosNaoParseados: number;
    estrutura: Prisma.InputJsonValue;
    contentHash: string | null;
    binarioStorageKey: string;
    tamanhoBytes: bigint;
  } {
    const formato = ManuscritoMapper.mimeTypeToFormato(manuscrito.mimeType);
    const { totalCapitulos, totalImagens, trechosNaoParseados } =
      ManuscritoMapper.countEstrutura(manuscrito.estrutura);

    return {
      id: manuscrito.id,
      projetoId: manuscrito.projetoId,
      nomeArquivo: manuscrito.filename,
      formato,
      status: ManuscritoMapper.statusToDb(manuscrito.status),
      totalCapitulos,
      totalImagens,
      trechosNaoParseados,
      estrutura: manuscrito.estrutura as unknown as Prisma.InputJsonValue,
      contentHash: null,
      binarioStorageKey: manuscrito.storageKey,
      tamanhoBytes: manuscrito.tamanhoBytes,
    };
  }

  /**
   * Converte o modelo Prisma para o agregado de domínio.
   *
   * `empresaId` não está na tabela; é injetado pelo chamador a partir do contexto
   * da requisição (EmpresaContext), pois o schema-per-tenant já garante o isolamento.
   */
  static toDomain(row: PrismaManuscrito, empresaId: string): Manuscrito {
    return new Manuscrito({
      id: row.id,
      projetoId: row.projetoId,
      empresaId,
      filename: row.nomeArquivo,
      mimeType: ManuscritoMapper.formatoToMimeType(row.formato),
      storageKey: row.binarioStorageKey,
      estrutura: row.estrutura as unknown as ContentTree,
      status: ManuscritoMapper.statusFromDb(row.status),
      createdAt: row.criadoEm,
      tamanhoBytes: row.tamanhoBytes,
    });
  }

  // --- Helpers de mapeamento ---

  private static mimeTypeToFormato(mimeType: ManuscritoMimeType): string {
    const map: Record<ManuscritoMimeType, string> = {
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
      'text/markdown': 'markdown',
    };
    return map[mimeType] ?? 'docx';
  }

  private static formatoToMimeType(formato: string): ManuscritoMimeType {
    if (formato === 'markdown') return 'text/markdown';
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }

  private static statusToDb(status: ManuscritoStatus): string {
    // MVP: 'imported' é o estado terminal após importação bem-sucedida.
    // Estados futuros (REVISAO_ESTRUTURA, IGNORADO, CONFIRMADO) aguardam
    // expansão do schema Prisma (nova migration).
    const map: Record<ManuscritoStatus, string> = {
      imported: 'imported',
      parsing: 'imported',
      import_failed: 'imported',
      PENDING_REVIEW: 'imported',
      REVISAO_ESTRUTURA: 'imported',
      IGNORADO: 'imported',
      CONFIRMADO: 'imported',
    };
    return map[status] ?? 'imported';
  }

  private static statusFromDb(dbStatus: string): ManuscritoStatus {
    if (dbStatus === 'imported') return 'PENDING_REVIEW';
    return 'PENDING_REVIEW';
  }

  /** Conta capítulos, imagens e trechos não-parseados a partir da ContentTree. */
  private static countEstrutura(estrutura: ContentTree): {
    totalCapitulos: number;
    totalImagens: number;
    trechosNaoParseados: number;
  } {
    let totalImagens = 0;
    let trechosNaoParseados = estrutura.orphanUnparsedSegments.length;

    for (const chapter of estrutura.chapters) {
      for (const section of chapter.sections) {
        totalImagens += section.blocks.filter((b) => b.type === 'image').length;
        trechosNaoParseados += section.unparsedSegments.length;
      }
    }

    return {
      totalCapitulos: estrutura.chapters.length,
      totalImagens,
      trechosNaoParseados,
    };
  }
}
