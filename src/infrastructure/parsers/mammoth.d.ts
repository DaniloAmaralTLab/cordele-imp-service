/**
 * Local type declaration for mammoth (no @types/mammoth on npm).
 * Only the APIs used by DocxParserAdapter are declared here.
 */
declare module 'mammoth' {
  export interface MammothMessage {
    type: 'warning' | 'error';
    message: string;
    paragraph?: string;
  }

  export interface ConversionResult {
    value: string;
    messages: MammothMessage[];
  }

  export interface ImageHandler {
    (element: { buffer: Buffer; contentType: string }): Promise<{
      src: string;
    }>;
  }

  export interface ConvertOptions {
    buffer?: Buffer;
    path?: string;
    styleMap?: string | string[];
    convertImage?: ImageHandler;
    includeEmbeddedStyleMap?: boolean;
    ignoreEmptyParagraphs?: boolean;
  }

  export function convertToHtml(options: ConvertOptions): Promise<ConversionResult>;
  export function extractRawText(options: ConvertOptions): Promise<ConversionResult>;

  export namespace images {
    function inline(
      handler: (element: { buffer: Buffer; contentType: string }) => Promise<Record<string, string>>,
    ): ImageHandler;
  }
}
