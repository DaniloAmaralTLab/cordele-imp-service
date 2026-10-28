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

/**
 * Razões pelas quais um segmento não pôde ser parseado.
 *
 * Valores canônicos (feature/spec): complex_table, math_equation, nested_footnote,
 * unknown_docx_style, unsupported_markup, embedded_object, other.
 *
 * Valores legados mantidos para compatibilidade com adapters existentes até refactor:
 * unsupported_media, nested_list, unknown_style, corrupted_content, missing_mapping.
 */
export type UnparsedReason =
  // Canonical values (feature spec / ADR-002)
  | 'complex_table'
  | 'math_equation'
  | 'nested_footnote'
  | 'unknown_docx_style'
  | 'unsupported_markup'
  | 'embedded_object'
  | 'other'
  // Legacy values — adapters in refactor phase; keep until markdown/docx adapters are updated
  | 'unsupported_media'
  | 'nested_list'
  | 'unknown_style'
  | 'corrupted_content'
  | 'missing_mapping';

/** Localização da fonte onde o segmento foi detectado. */
export interface SourceLocation {
  /** Formato da fonte: 'docx' | 'markdown'. */
  readonly kind: 'docx' | 'markdown';
  /** Offset byte aproximado no arquivo original (best-effort). */
  readonly offset?: number;
}

/** Run de texto dentro de um parágrafo (span com formatação consistente). */
export interface TextRun {
  readonly text: string;
  readonly bold?: boolean;
  readonly italic?: boolean;
  readonly underline?: boolean;
}

export interface Block {
  readonly id: string;
  readonly type: BlockType;
  /** Conteúdo textual bruto ou caminho de asset para imagens. */
  readonly content: string;
  readonly order: number;
  /**
   * Runs de texto para blocos do tipo 'paragraph'.
   * Quando presente, a concatenação de runs[*].text deve igualar content.
   * Opcional: parsers que não decompõem em runs omitem este campo.
   */
  readonly runs?: readonly TextRun[];
}

export interface UnparsedSegment {
  readonly id: string;
  readonly reason: UnparsedReason;
  readonly rawContent: string;
  readonly order: number;
  /** Localização na fonte onde o segmento não-parseado foi detectado. */
  readonly sourceLocation?: SourceLocation;
}
