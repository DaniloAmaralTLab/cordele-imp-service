/**
 * Helper de fixtures para os testes do DocxParserAdapter.
 *
 * Gera buffers DOCX mínimos e válidos que o mammoth consegue processar.
 * DOCX é um arquivo ZIP com `word/document.xml` usando Open XML (OOXML).
 *
 * Usado apenas em testes — não é exportado pelo módulo de produção.
 */

import * as zlib from 'node:zlib';
import { promisify } from 'node:util';

const deflateRaw = promisify(zlib.deflateRaw);

// ---------------------------------------------------------------------------
// ZIP builder mínimo (suficiente para mammoth processar)
// ---------------------------------------------------------------------------

interface ZipEntry {
  name: string;
  data: Buffer;
}

async function buildZip(entries: ZipEntry[]): Promise<Buffer> {
  const parts: Buffer[] = [];
  const centralDir: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = Buffer.from(entry.name, 'utf-8');
    const compressed = await deflateRaw(entry.data);
    const crc32val = crc32(entry.data);

    // Local file header.
    const lfh = Buffer.alloc(30);
    lfh.writeUInt32LE(0x04034b50, 0); // signature
    lfh.writeUInt16LE(20, 4); // version needed
    lfh.writeUInt16LE(0, 6); // flags
    lfh.writeUInt16LE(8, 8); // compression (deflate)
    lfh.writeUInt16LE(0, 10); // mod time
    lfh.writeUInt16LE(0, 12); // mod date
    lfh.writeUInt32LE(crc32val, 14); // crc32
    lfh.writeUInt32LE(compressed.length, 18); // compressed size
    lfh.writeUInt32LE(entry.data.length, 22); // uncompressed size
    lfh.writeUInt16LE(nameBytes.length, 26); // name length
    lfh.writeUInt16LE(0, 28); // extra length

    parts.push(lfh, nameBytes, compressed);

    // Central directory entry.
    const cde = Buffer.alloc(46);
    cde.writeUInt32LE(0x02014b50, 0); // signature
    cde.writeUInt16LE(20, 4); // version made by
    cde.writeUInt16LE(20, 6); // version needed
    cde.writeUInt16LE(0, 8); // flags
    cde.writeUInt16LE(8, 10); // compression
    cde.writeUInt16LE(0, 12); // mod time
    cde.writeUInt16LE(0, 14); // mod date
    cde.writeUInt32LE(crc32val, 16); // crc32
    cde.writeUInt32LE(compressed.length, 20); // compressed size
    cde.writeUInt32LE(entry.data.length, 24); // uncompressed size
    cde.writeUInt16LE(nameBytes.length, 28); // name length
    cde.writeUInt16LE(0, 30); // extra length
    cde.writeUInt16LE(0, 32); // comment length
    cde.writeUInt16LE(0, 34); // disk start
    cde.writeUInt16LE(0, 36); // internal attrs
    cde.writeUInt32LE(0, 38); // external attrs
    cde.writeUInt32LE(offset, 42); // offset of local file header

    centralDir.push(cde, nameBytes);
    offset += 30 + nameBytes.length + compressed.length;
  }

  const cdStart = offset;
  const cdBuffer = Buffer.concat(centralDir);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // signature
  eocd.writeUInt16LE(0, 4); // disk number
  eocd.writeUInt16LE(0, 6); // disk with cd start
  eocd.writeUInt16LE(entries.length, 8); // entries on disk
  eocd.writeUInt16LE(entries.length, 10); // total entries
  eocd.writeUInt32LE(cdBuffer.length, 12); // cd size
  eocd.writeUInt32LE(cdStart, 16); // cd offset
  eocd.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...parts, cdBuffer, eocd]);
}

/** CRC-32 simples. */
function crc32(buf: Buffer): number {
  const table = makeCrcTable();
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeCrcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
}

// ---------------------------------------------------------------------------
// Content Types XML (obrigatório para OOXML)
// ---------------------------------------------------------------------------

const CONTENT_TYPES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml"
    ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

const RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"
    Target="word/document.xml"/>
</Relationships>`;

const WORD_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`;

// ---------------------------------------------------------------------------
// Builders de documentos de fixture
// ---------------------------------------------------------------------------

function makeDocumentXml(body: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"
  xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${body}
    <w:sectPr/>
  </w:body>
</w:document>`;
}

function heading1(text: string): string {
  return `<w:p>
    <w:pPr><w:pStyle w:val="Heading1"/></w:pPr>
    <w:r><w:t>${text}</w:t></w:r>
  </w:p>`;
}

function heading2(text: string): string {
  return `<w:p>
    <w:pPr><w:pStyle w:val="Heading2"/></w:pPr>
    <w:r><w:t>${text}</w:t></w:r>
  </w:p>`;
}

function paragraph(text: string): string {
  return `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;
}

function imageRef(rId: string): string {
  return `<w:p>
    <w:r>
      <w:drawing>
        <wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
          <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
            <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
              <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
                <pic:blipFill>
                  <a:blip r:embed="${rId}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>
                </pic:blipFill>
              </pic:pic>
            </a:graphicData>
          </a:graphic>
        </wp:inline>
      </w:drawing>
    </w:r>
  </w:p>`;
}

function table(rows: string[][]): string {
  const rowXml = rows
    .map(
      (cells) =>
        `<w:tr>${cells.map((c) => `<w:tc><w:p><w:r><w:t>${c}</w:t></w:r></w:p></w:tc>`).join('')}</w:tr>`,
    )
    .join('');
  return `<w:tbl><w:tblPr/>${rowXml}</w:tbl>`;
}

async function buildDocx(documentXml: string): Promise<Buffer> {
  return buildZip([
    { name: '[Content_Types].xml', data: Buffer.from(CONTENT_TYPES_XML) },
    { name: '_rels/.rels', data: Buffer.from(RELS_XML) },
    { name: 'word/_rels/document.xml.rels', data: Buffer.from(WORD_RELS_XML) },
    { name: 'word/document.xml', data: Buffer.from(documentXml) },
  ]);
}

// ---------------------------------------------------------------------------
// Fixtures públicas
// ---------------------------------------------------------------------------

/** 3 capítulos, 1 seção cada, 1 parágrafo cada. Sem unparsed. */
export async function fixtureTresCapitulos(): Promise<Buffer> {
  const body = [
    heading1('Capítulo 1'),
    heading2('Seção 1.1'),
    paragraph('Texto do primeiro capítulo.'),
    heading1('Capítulo 2'),
    heading2('Seção 2.1'),
    paragraph('Texto do segundo capítulo.'),
    heading1('Capítulo 3'),
    heading2('Seção 3.1'),
    paragraph('Texto do terceiro capítulo.'),
  ].join('\n');
  return buildDocx(makeDocumentXml(body));
}

/** 1 capítulo com 1 tabela complexa → UnparsedSegment(complex_table). */
export async function fixtureComTabelaComplexa(): Promise<Buffer> {
  const body = [
    heading1('Capítulo com Tabela'),
    heading2('Seção com Tabela'),
    table([
      ['Cabeçalho A', 'Cabeçalho B', 'Cabeçalho C'],
      ['Dado 1', 'Dado 2', 'Dado 3'],
      ['Dado 4', 'Dado 5', 'Dado 6'],
    ]),
  ].join('\n');
  return buildDocx(makeDocumentXml(body));
}

/** Arquivo corrompido (bytes aleatórios com extensão .docx). */
export function fixtureDocxCorrompido(): Buffer {
  // 200 bytes de conteúdo inválido — não é um ZIP/DOCX válido.
  return Buffer.from(
    Array.from({ length: 200 }, (_, i) => (i * 37 + 13) % 256),
  );
}

/**
 * PNG 1x1 branco mínimo e válido (67 bytes).
 * Permite que o mammoth processe a imagem sem lançar exceção.
 */
const MINIMAL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

/** 1 capítulo com parágrafo de imagem referenciada. */
export async function fixtureComImagem(): Promise<Buffer> {
  const body = [
    heading1('Capítulo com Imagem'),
    heading2('Seção com Imagem'),
    paragraph('Texto antes da imagem.'),
    imageRef('rId1'),
    paragraph('Texto após a imagem.'),
  ].join('\n');

  // Relacionamento que aponta para a imagem real no ZIP (necessário para
  // que o mammoth resolva o rId1 sem lançar erro).
  const wordRelsWithImage = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image"
    Target="media/image1.png"/>
</Relationships>`;

  return buildZip([
    { name: '[Content_Types].xml', data: Buffer.from(CONTENT_TYPES_XML) },
    { name: '_rels/.rels', data: Buffer.from(RELS_XML) },
    { name: 'word/_rels/document.xml.rels', data: Buffer.from(wordRelsWithImage) },
    { name: 'word/document.xml', data: Buffer.from(makeDocumentXml(body)) },
    { name: 'word/media/image1.png', data: MINIMAL_PNG },
  ]);
}

/** Documento vazio — apenas seção de página. */
export async function fixtureVazio(): Promise<Buffer> {
  return buildDocx(makeDocumentXml(''));
}
