import type { ContentTree } from './content-tree';

/**
 * Manuscrito — agregado raiz do módulo IMP.
 *
 * Imutável após criação (INSERT-only; sem UPDATE).
 * Tipo puro de domínio; sem decoradores Nest nem imports Prisma (RULE-01/02).
 */

export type ManuscritoStatus =
  | 'PENDING_REVIEW'
  | 'REVISAO_ESTRUTURA'
  | 'IGNORADO'
  | 'CONFIRMADO';

export type ManuscritoMimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' | 'text/markdown';

export interface ManuscritoProps {
  readonly id: string;
  readonly projetoId: string;
  readonly empresaId: string;
  readonly filename: string;
  readonly mimeType: ManuscritoMimeType;
  readonly storageKey: string;
  readonly estrutura: ContentTree;
  readonly status: ManuscritoStatus;
  readonly createdAt: Date;
  /** Tamanho do arquivo original em bytes. Obrigatório para persistência (DB NOT NULL). */
  readonly tamanhoBytes?: bigint;
}

export class Manuscrito {
  readonly id: string;
  readonly projetoId: string;
  readonly empresaId: string;
  readonly filename: string;
  readonly mimeType: ManuscritoMimeType;
  readonly storageKey: string;
  readonly estrutura: ContentTree;
  readonly status: ManuscritoStatus;
  readonly createdAt: Date;
  /** Tamanho do arquivo original em bytes. Obrigatório para persistência (DB NOT NULL > 0). */
  readonly tamanhoBytes: bigint;

  constructor(props: ManuscritoProps) {
    this.id = props.id;
    this.projetoId = props.projetoId;
    this.empresaId = props.empresaId;
    this.filename = props.filename;
    this.mimeType = props.mimeType;
    this.storageKey = props.storageKey;
    this.estrutura = props.estrutura;
    this.status = props.status;
    this.createdAt = props.createdAt;
    // Default 1n satisfies DB constraint (tamanho_bytes > 0); P4 populates real value.
    this.tamanhoBytes = props.tamanhoBytes ?? BigInt(1);
  }

  static create(props: Omit<ManuscritoProps, 'createdAt' | 'status'>): Manuscrito {
    return new Manuscrito({
      ...props,
      status: 'PENDING_REVIEW',
      createdAt: new Date(),
    });
  }

  /**
   * Verifica se um segmento identificado pelo id pertence à estrutura do manuscrito.
   */
  hasSegmento(segmentoId: string): boolean {
    for (const chapter of this.estrutura.chapters) {
      for (const section of chapter.sections) {
        const inBlocks = section.blocks.some((b) => b.id === segmentoId);
        const inUnparsed = section.unparsedSegments.some((u) => u.id === segmentoId);
        if (inBlocks || inUnparsed) return true;
      }
    }
    const inOrphans = this.estrutura.orphanUnparsedSegments.some(
      (u) => u.id === segmentoId,
    );
    return inOrphans;
  }
}
