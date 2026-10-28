import type { Block, UnparsedSegment } from './block';

/**
 * ContentTree — representação canônica da estrutura de um manuscrito.
 *
 * Árvore imutável: capítulos → seções → blocos.
 * Tipo puro de domínio; sem decoradores Nest nem imports Prisma.
 */

export interface Section {
  readonly id: string;
  readonly title: string;
  readonly order: number;
  readonly blocks: readonly Block[];
  readonly unparsedSegments: readonly UnparsedSegment[];
}

export interface Chapter {
  readonly id: string;
  readonly title: string;
  readonly order: number;
  readonly sections: readonly Section[];
}

export interface ContentTree {
  readonly chapters: readonly Chapter[];
  /** Segmentos não parseados que não pertencem a nenhum capítulo/seção. */
  readonly orphanUnparsedSegments: readonly UnparsedSegment[];
}
