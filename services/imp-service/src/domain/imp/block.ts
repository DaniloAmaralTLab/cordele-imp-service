/**
 * Block — unidade atômica de conteúdo dentro de uma seção.
 *
 * Tipo puro de domínio; sem decoradores Nest nem imports Prisma.
 */
export type BlockType =
  | 'paragraph'
  | 'heading'
  | 'image'
  | 'table'
  | 'code'
  | 'quote'
  | 'list';

/** Razões pelas quais um segmento não pôde ser parseado. */
export type UnparsedReason =
  | 'complex_table'
  | 'unsupported_media'
  | 'nested_list'
  | 'embedded_object'
  | 'unknown_style'
  | 'corrupted_content'
  | 'missing_mapping';

export interface Block {
  readonly id: string;
  readonly type: BlockType;
  /** Conteúdo textual bruto ou caminho de asset para imagens. */
  readonly content: string;
  readonly order: number;
}

export interface UnparsedSegment {
  readonly id: string;
  readonly reason: UnparsedReason;
  readonly rawContent: string;
  readonly order: number;
}
