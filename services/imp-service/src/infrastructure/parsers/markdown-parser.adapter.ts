import { Injectable, Logger } from '@nestjs/common';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { randomUUID } from 'node:crypto';

import type { Block, UnparsedSegment } from '../../domain/imp/block';
import type { Chapter, ContentTree, Section } from '../../domain/imp/content-tree';
import {
  ManuscriptParseError,
  type ManuscriptParserPort,
} from '../../domain/imp/ports/manuscript-parser.port';

/** MIME types suportados por este adapter. */
const SUPPORTED_MIME = new Set(['text/markdown', 'text/x-markdown', 'text/plain']);

// ---------------------------------------------------------------------------
// Tipos MDAST (subconjunto usado por este adapter)
// ---------------------------------------------------------------------------

type MdastNodeType =
  | 'root'
  | 'heading'
  | 'paragraph'
  | 'image'
  | 'table'
  | 'list'
  | 'listItem'
  | 'code'
  | 'blockquote'
  | 'html'
  | 'text'
  | 'inlineCode'
  | 'strong'
  | 'emphasis'
  | 'link'
  | 'thematicBreak';

interface MdastNode {
  type: MdastNodeType | string;
  depth?: number; // para heading
  ordered?: boolean; // para list
  spread?: boolean; // para list/listItem
  lang?: string | null; // para code
  url?: string; // para image e link
  alt?: string; // para image
  value?: string; // para text, code, html, inlineCode
  children?: MdastNode[];
}

/**
 * Adapter Markdown → ContentTree usando remark-parse (unified@10 CJS).
 *
 * Mapeamento:
 *   # H1 → Chapter
 *   ## H2 → Section
 *   paragraph → Block(paragraph)
 *   image → Block(image)
 *   table (GFM pipe tables) → UnparsedSegment(complex_table)
 *   list aninhada → UnparsedSegment(nested_list)
 *   code block → Block(code)
 *   blockquote → Block(quote)
 *
 * Implementa ManuscriptParserPort (RULE-06).
 */
@Injectable()
export class MarkdownParserAdapter implements ManuscriptParserPort {
  private readonly logger = new Logger(MarkdownParserAdapter.name);

  private readonly parser = unified().use(remarkParse);

  supports(mimeType: string): boolean {
    return SUPPORTED_MIME.has(mimeType);
  }

  async parse(buffer: Buffer, _mimeType: string): Promise<ContentTree> {
    let root: MdastNode;
    try {
      const content = buffer.toString('utf-8');
      root = this.parser.parse(content) as unknown as MdastNode;
    } catch (err) {
      throw new ManuscriptParseError('corrupted_content', err);
    }

    const contentTree = buildContentTreeFromMdast(root);

    this.logger.log(
      `Parsed Markdown: ${contentTree.chapters.length} capítulos, ` +
        `${contentTree.orphanUnparsedSegments.length} segmentos não parseados`,
    );

    return contentTree;
  }
}

// ---------------------------------------------------------------------------
// MDAST → ContentTree converter
// ---------------------------------------------------------------------------

interface BuildState {
  chapters: InternalChapter[];
  currentChapter: InternalChapter | null;
  currentSection: InternalSection | null;
  blockOrder: number;
  orphanUnparsed: UnparsedSegment[];
}

interface InternalChapter {
  id: string;
  title: string;
  order: number;
  sections: InternalSection[];
}

interface InternalSection {
  id: string;
  title: string;
  order: number;
  blocks: Block[];
  unparsedSegments: UnparsedSegment[];
}

function buildContentTreeFromMdast(root: MdastNode): ContentTree {
  const state: BuildState = {
    chapters: [],
    currentChapter: null,
    currentSection: null,
    blockOrder: 0,
    orphanUnparsed: [],
  };

  for (const node of root.children ?? []) {
    processNode(node, state);
  }

  const chapters: Chapter[] = state.chapters.map((ch) => ({
    id: ch.id,
    title: ch.title,
    order: ch.order,
    sections: ch.sections.map((sec) => ({
      id: sec.id,
      title: sec.title,
      order: sec.order,
      blocks: sec.blocks,
      unparsedSegments: sec.unparsedSegments,
    })) satisfies Section[],
  })) satisfies Chapter[];

  return {
    chapters,
    orphanUnparsedSegments: state.orphanUnparsed,
  };
}

function processNode(node: MdastNode, state: BuildState): void {
  switch (node.type) {
    case 'heading':
      handleHeading(node, state);
      break;
    case 'paragraph':
      handleParagraph(node, state);
      break;
    case 'image':
      addBlockToState(state, {
        id: randomUUID(),
        type: 'image',
        content: node.url ?? '',
        order: state.blockOrder++,
      });
      break;
    case 'code':
      addBlockToState(state, {
        id: randomUUID(),
        type: 'code',
        content: node.value ?? '',
        order: state.blockOrder++,
      });
      break;
    case 'blockquote':
      addBlockToState(state, {
        id: randomUUID(),
        type: 'quote',
        content: extractTextFromChildren(node.children ?? []),
        order: state.blockOrder++,
      });
      break;
    case 'table':
      // GFM-style table ou tabela pipe → UnparsedSegment(complex_table).
      addUnparsedToState(state, {
        id: randomUUID(),
        reason: 'complex_table',
        rawContent: extractTextFromChildren(node.children ?? []),
        order: state.blockOrder++,
      });
      break;
    case 'list':
      handleList(node, state);
      break;
    case 'html':
      // HTML inline bruto → UnparsedSegment(unsupported_media) se for media, senão missing_mapping.
      handleHtmlNode(node, state);
      break;
    case 'thematicBreak':
      // Linha horizontal — ignorada na estrutura.
      break;
    default:
      // Tipo desconhecido → UnparsedSegment(missing_mapping).
      if (node.value || (node.children && node.children.length > 0)) {
        addUnparsedToState(state, {
          id: randomUUID(),
          reason: 'missing_mapping',
          rawContent: node.value ?? node.type,
          order: state.blockOrder++,
        });
      }
      break;
  }
}

function handleHeading(node: MdastNode, state: BuildState): void {
  const title = extractTextFromChildren(node.children ?? []);
  const depth = node.depth ?? 1;

  if (depth === 1) {
    const chapter: InternalChapter = {
      id: randomUUID(),
      title,
      order: state.chapters.length,
      sections: [],
    };
    state.chapters.push(chapter);
    state.currentChapter = chapter;
    state.currentSection = null;
    state.blockOrder = 0;
  } else if (depth === 2) {
    if (!state.currentChapter) {
      const defaultChapter: InternalChapter = {
        id: randomUUID(),
        title: '(Sem capítulo)',
        order: state.chapters.length,
        sections: [],
      };
      state.chapters.push(defaultChapter);
      state.currentChapter = defaultChapter;
    }
    const section: InternalSection = {
      id: randomUUID(),
      title,
      order: state.currentChapter.sections.length,
      blocks: [],
      unparsedSegments: [],
    };
    state.currentChapter.sections.push(section);
    state.currentSection = section;
    state.blockOrder = 0;
  } else {
    // H3+ → Block(heading) dentro da seção atual.
    addBlockToState(state, {
      id: randomUUID(),
      type: 'heading',
      content: title,
      order: state.blockOrder++,
    });
  }
}

function handleParagraph(node: MdastNode, state: BuildState): void {
  const children = node.children ?? [];

  // Parágrafo contendo apenas uma imagem inline.
  if (children.length === 1 && children[0].type === 'image') {
    const imgNode = children[0];
    const mimeType = inferMimeFromUrl(imgNode.url ?? '');
    if (mimeType && !isSupportedImageMime(mimeType)) {
      addUnparsedToState(state, {
        id: randomUUID(),
        reason: 'unsupported_media',
        rawContent: imgNode.url ?? '',
        order: state.blockOrder++,
      });
    } else {
      addBlockToState(state, {
        id: randomUUID(),
        type: 'image',
        content: imgNode.url ?? '',
        order: state.blockOrder++,
      });
    }
    return;
  }

  // remark-parse (CommonMark) trata tags HTML não-standard como HTML inline
  // dentro de parágrafos (ex.: <video>, <audio>, <widget>, <object>).
  // Processar cada filho html inline como se fosse um nó html de bloco.
  const hasHtmlChild = children.some((c) => c.type === 'html');
  if (hasHtmlChild) {
    for (const child of children) {
      if (child.type === 'html') {
        handleHtmlNode(child, state);
      }
    }
    // Se há texto não-HTML restante no parágrafo, adicioná-lo como bloco.
    const nonHtmlText = extractTextFromChildren(
      children.filter((c) => c.type !== 'html'),
    );
    if (nonHtmlText.trim()) {
      addBlockToState(state, {
        id: randomUUID(),
        type: 'paragraph',
        content: nonHtmlText,
        order: state.blockOrder++,
      });
    }
    return;
  }

  const text = extractTextFromChildren(children);
  if (text.trim()) {
    addBlockToState(state, {
      id: randomUUID(),
      type: 'paragraph',
      content: text,
      order: state.blockOrder++,
    });
  }
}

function handleList(node: MdastNode, state: BuildState): void {
  // Verifica se a lista tem itens com sub-listas (nested_list).
  const hasNestedList = (node.children ?? []).some((item) =>
    (item.children ?? []).some(
      (child) => child.type === 'list',
    ),
  );

  if (hasNestedList) {
    addUnparsedToState(state, {
      id: randomUUID(),
      reason: 'nested_list',
      rawContent: extractTextFromChildren(node.children ?? []),
      order: state.blockOrder++,
    });
  } else {
    // Lista simples → Block(list).
    addBlockToState(state, {
      id: randomUUID(),
      type: 'list',
      content: extractTextFromChildren(node.children ?? []),
      order: state.blockOrder++,
    });
  }
}

function handleHtmlNode(node: MdastNode, state: BuildState): void {
  const raw = (node.value ?? '').toLowerCase();
  if (raw.includes('<video') || raw.includes('<audio') || raw.includes('<embed')) {
    addUnparsedToState(state, {
      id: randomUUID(),
      reason: 'unsupported_media',
      rawContent: node.value ?? '',
      order: state.blockOrder++,
    });
  } else {
    addUnparsedToState(state, {
      id: randomUUID(),
      reason: 'missing_mapping',
      rawContent: node.value ?? '',
      order: state.blockOrder++,
    });
  }
}

function addBlockToState(state: BuildState, block: Block): void {
  if (state.currentSection) {
    state.currentSection.blocks.push(block);
  }
  // Blocos antes de qualquer seção são descartados (texto pré-estrutural).
}

function addUnparsedToState(state: BuildState, segment: UnparsedSegment): void {
  if (state.currentSection) {
    state.currentSection.unparsedSegments.push(segment);
  } else {
    state.orphanUnparsed.push(segment);
  }
}

function extractTextFromChildren(children: MdastNode[]): string {
  return children
    .map((child) => {
      if (child.value !== undefined) return child.value;
      if (child.children) return extractTextFromChildren(child.children);
      return '';
    })
    .join('');
}

function inferMimeFromUrl(url: string): string | null {
  const ext = url.split('.').pop()?.toLowerCase();
  const mimeMap: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    webp: 'image/webp',
    mp4: 'video/mp4',
    mp3: 'audio/mpeg',
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };
  return ext ? (mimeMap[ext] ?? null) : null;
}

function isSupportedImageMime(mime: string): boolean {
  return ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'].includes(mime);
}
