import { Injectable, Logger } from '@nestjs/common';
import * as mammoth from 'mammoth';
import { randomUUID } from 'node:crypto';

import type { Block, UnparsedSegment } from '../../domain/imp/block';
import type { Chapter, ContentTree, Section } from '../../domain/imp/content-tree';
import {
  ManuscriptParseError,
  type ManuscriptParserPort,
} from '../../domain/imp/ports/manuscript-parser.port';

/** MIME types suportados por este adapter. */
const SUPPORTED_MIME = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
]);

/**
 * Adapter DOCX → ContentTree usando mammoth.
 *
 * Style map: H1=chapter, H2=section.
 * Tabelas → UnparsedSegment(complex_table).
 * Implementa ManuscriptParserPort (RULE-06: clientes de I/O somente em infrastructure).
 */
@Injectable()
export class DocxParserAdapter implements ManuscriptParserPort {
  private readonly logger = new Logger(DocxParserAdapter.name);

  private readonly styleMap = [
    "p[style-name='Heading 1'] => h1:fresh",
    "p[style-name='Heading 2'] => h2:fresh",
    "p[style-name='Cabeçalho 1'] => h1:fresh",
    "p[style-name='Cabeçalho 2'] => h2:fresh",
  ].join('\n');

  supports(mimeType: string): boolean {
    return SUPPORTED_MIME.has(mimeType);
  }

  async parse(buffer: Buffer, _mimeType: string): Promise<ContentTree> {
    let result: Awaited<ReturnType<typeof mammoth.convertToHtml>>;

    try {
      result = await mammoth.convertToHtml({
        buffer,
        styleMap: this.styleMap,
        ignoreEmptyParagraphs: true,
      });
    } catch (err) {
      throw new ManuscriptParseError('corrupted_content', err);
    }

    const { value: html, messages } = result;

    this.logger.debug(`Mammoth converteu DOCX: ${messages.length} messages`);

    // Coleta UnparsedSegments derivados das mensagens do mammoth.
    const orphanUnparsed: UnparsedSegment[] = messages
      .filter((m) => m.type === 'warning' || m.type === 'error')
      .map((m) => mapMessageToUnparsed(m.message, m.paragraph))
      .filter((u): u is UnparsedSegment => u !== null);

    const contentTree = parseHtmlToContentTree(html, orphanUnparsed);

    this.logger.log(
      `Parsed DOCX: ${contentTree.chapters.length} capítulos, ` +
        `${contentTree.orphanUnparsedSegments.length} segmentos não parseados`,
    );

    return contentTree;
  }
}

/**
 * Mapeia uma mensagem de aviso/erro do mammoth para um UnparsedSegment.
 * Retorna null se a mensagem não corresponde a nenhum motivo conhecido.
 */
function mapMessageToUnparsed(
  message: string,
  rawContent?: string,
): UnparsedSegment | null {
  const lower = message.toLowerCase();

  let reason: UnparsedSegment['reason'] | null = null;

  if (lower.includes('unrecognised') || lower.includes('unrecognized') || lower.includes('unknown style')) {
    reason = 'unknown_style';
  } else if (lower.includes('embedded') || lower.includes('ole object') || lower.includes('object')) {
    reason = 'embedded_object';
  } else if (lower.includes('missing') || lower.includes('no mapping')) {
    reason = 'missing_mapping';
  } else if (lower.includes('corrupt') || lower.includes('invalid') || lower.includes('error')) {
    reason = 'corrupted_content';
  } else if (lower.includes('unsupported media') || lower.includes('media type')) {
    reason = 'unsupported_media';
  }

  if (!reason) return null;

  return {
    id: randomUUID(),
    reason,
    rawContent: rawContent ?? message,
    order: 0,
  };
}

// ---------------------------------------------------------------------------
// HTML → ContentTree parser (stateful, baseado na saída limpa do mammoth)
// ---------------------------------------------------------------------------

interface BuildState {
  chapters: InternalChapter[];
  currentChapter: InternalChapter | null;
  currentSection: InternalSection | null;
  blockOrder: number;
  orphanUnparsed: UnparsedSegment[];
  tableDepth: number;
  listDepth: number;
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

/** Parsing regex: detecta tags de abertura, fechamento e texto. */
const TOKEN_RE = /<(\/?)(\w+)([^>]*)>|([^<]+)/g;

function parseHtmlToContentTree(
  html: string,
  orphanUnparsedFromMessages: UnparsedSegment[],
): ContentTree {
  const state: BuildState = {
    chapters: [],
    currentChapter: null,
    currentSection: null,
    blockOrder: 0,
    orphanUnparsed: [...orphanUnparsedFromMessages],
    tableDepth: 0,
    listDepth: 0,
  };

  // Coleta texto acumulado entre tags.
  let pendingText = '';

  // Tag de contexto atual para captura de texto.
  let insideTag: 'h1' | 'h2' | 'p' | null = null;

  for (const match of html.matchAll(TOKEN_RE)) {
    const [, closing, tag, attrs, textNode] = match;

    if (textNode !== undefined) {
      // Nó de texto — acumular se dentro de tag relevante.
      if (insideTag) {
        pendingText += textNode;
      }
      continue;
    }

    const isClosing = closing === '/';
    const tagName = tag.toLowerCase();

    if (!isClosing) {
      // Tag de abertura.
      switch (tagName) {
        case 'h1':
          insideTag = 'h1';
          pendingText = '';
          break;
        case 'h2':
          insideTag = 'h2';
          pendingText = '';
          break;
        case 'p':
          insideTag = 'p';
          pendingText = '';
          break;
        case 'img': {
          // Bloco de imagem (tag self-closing ou aberta sem fechamento explícito).
          const srcMatch = /src="([^"]*)"/.exec(attrs);
          const src = srcMatch ? srcMatch[1] : '';
          addBlockToState(state, {
            id: randomUUID(),
            type: 'image',
            content: src,
            order: state.blockOrder++,
          });
          break;
        }
        case 'table':
          state.tableDepth++;
          if (state.tableDepth === 1) {
            addUnparsedToState(state, {
              id: randomUUID(),
              reason: 'complex_table',
              rawContent: '<table>...</table>',
              order: state.blockOrder++,
            });
          }
          break;
        case 'ul':
        case 'ol':
          state.listDepth++;
          if (state.listDepth > 1) {
            // Lista aninhada.
            addUnparsedToState(state, {
              id: randomUUID(),
              reason: 'nested_list',
              rawContent: `<${tagName}>...</${tagName}>`,
              order: state.blockOrder++,
            });
          }
          break;
      }
    } else {
      // Tag de fechamento.
      switch (tagName) {
        case 'h1': {
          const title = pendingText.trim();
          if (title) {
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
          }
          insideTag = null;
          pendingText = '';
          break;
        }
        case 'h2': {
          const title = pendingText.trim();
          if (title) {
            // Garante que exista um capítulo padrão se nenhum H1 precedeu.
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
          }
          insideTag = null;
          pendingText = '';
          break;
        }
        case 'p': {
          const text = pendingText.trim();
          if (text) {
            addBlockToState(state, {
              id: randomUUID(),
              type: 'paragraph',
              content: text,
              order: state.blockOrder++,
            });
          }
          insideTag = null;
          pendingText = '';
          break;
        }
        case 'table':
          if (state.tableDepth > 0) state.tableDepth--;
          break;
        case 'ul':
        case 'ol':
          if (state.listDepth > 0) state.listDepth--;
          break;
      }
    }
  }

  return buildContentTree(state);
}

function addBlockToState(state: BuildState, block: Block): void {
  if (state.currentSection) {
    state.currentSection.blocks.push(block);
  }
  // Blocos fora de seção são descartados (orphan text antes de qualquer H1/H2).
}

function addUnparsedToState(state: BuildState, segment: UnparsedSegment): void {
  if (state.currentSection) {
    state.currentSection.unparsedSegments.push(segment);
  } else {
    state.orphanUnparsed.push(segment);
  }
}

function buildContentTree(state: BuildState): ContentTree {
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
