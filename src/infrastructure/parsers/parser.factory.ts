import { Injectable, Logger } from '@nestjs/common';

import type { ContentTree } from '../../domain/imp/content-tree';
import {
  ManuscriptParseError,
  type ManuscriptParserPort,
} from '../../domain/imp/ports/manuscript-parser.port';
import { DocxParserAdapter } from './docx-parser.adapter';
import { MarkdownParserAdapter } from './markdown-parser.adapter';

/**
 * ParserFactory — implementação de ManuscriptParserPort que delega
 * ao adapter correto com base no MIME type.
 *
 * Registrada como MANUSCRIPT_PARSER_PORT em PersistenceModule (P4).
 * Novos adapters são adicionados ao array `adapters`; a fábrica seleciona
 * o primeiro que retorna `supports(mimeType) === true`.
 */
@Injectable()
export class ParserFactory implements ManuscriptParserPort {
  private readonly logger = new Logger(ParserFactory.name);
  private readonly adapters: ManuscriptParserPort[];

  constructor(
    private readonly docxParser: DocxParserAdapter,
    private readonly markdownParser: MarkdownParserAdapter,
  ) {
    this.adapters = [this.docxParser, this.markdownParser];
  }

  supports(mimeType: string): boolean {
    return this.adapters.some((a) => a.supports(mimeType));
  }

  async parse(buffer: Buffer, mimeType: string): Promise<ContentTree> {
    const adapter = this.adapters.find((a) => a.supports(mimeType));
    if (!adapter) {
      this.logger.warn(`Nenhum adapter suporta mimeType: ${mimeType}`);
      throw new ManuscriptParseError(`Unsupported mimeType: ${mimeType}`);
    }
    return adapter.parse(buffer, mimeType);
  }
}
