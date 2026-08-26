/**
 * Seed script — gera os 6 fixtures de BDD para o módulo IMP.
 *
 * Uso: ts-node scripts/seed-imp-fixtures.ts
 * (ou pnpm seed:imp-fixtures)
 *
 * Idempotente: arquivos já existentes são preservados (não sobrescritos).
 *
 * Fixtures gerados em test/fixtures/:
 *   livro-3-capitulos.docx      — DOCX válido: 3 capítulos (H1) via `docx` npm
 *   livro-com-tabela-complexa.docx — DOCX válido: 1 tabela simples
 *   livro.md                    — Markdown simples
 *   livro.pdf                   — Bytes mínimos de PDF (dispara 415)
 *   livro-51mb.docx             — 53 690 000 bytes (dispara 413)
 *   livro-corrompido.docx       — 100 bytes aleatórios (dispara 422)
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

import {
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';

const FIXTURES_DIR = join(__dirname, '..', 'test', 'fixtures');

mkdirSync(FIXTURES_DIR, { recursive: true });

/**
 * Emissor de saída do script de seed.
 *
 * Usa `process.stdout` em vez de `console.log`: RULE-08 proíbe `console.log` em
 * todo o serviço e o gate `arch-conformance` (no-console-log) varre `scripts/`
 * junto com `src/`. Este script é um CLI standalone — não roda dentro do Nest —
 * portanto não tem um logger do framework disponível.
 */
function out(line: string): void {
  process.stdout.write(`${line}\n`);
}

function idempotentWrite(filename: string, data: Buffer | string): void {
  const fullPath = join(FIXTURES_DIR, filename);
  if (existsSync(fullPath)) {
    out(`  SKIP ${filename} (já existe)`);
    return;
  }
  writeFileSync(fullPath, data);
  out(`  OK   ${filename}`);
}

/** Imagem PNG 1×1 pixel transparente (26 bytes) — embutida nos DOCX. */
const TINY_PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

async function main(): Promise<void> {
  out(`Gerando fixtures IMP em: ${FIXTURES_DIR}`);

  // ── livro-3-capitulos.docx ─────────────────────────────────────────────────
  {
    const doc = new Document({
      sections: [
        {
          children: [
            new Paragraph({ text: 'Capítulo 1 — Início', heading: HeadingLevel.HEADING_1 }),
            new Paragraph({ children: [new TextRun('Este é o texto do primeiro capítulo.')] }),
            new Paragraph({
              children: [
                new ImageRun({ data: TINY_PNG_1x1, transformation: { width: 1, height: 1 }, type: 'png' }),
              ],
            }),
            new Paragraph({ text: 'Capítulo 2 — Meio', heading: HeadingLevel.HEADING_1 }),
            new Paragraph({ children: [new TextRun('Este é o texto do segundo capítulo.')] }),
            new Paragraph({
              children: [
                new ImageRun({ data: TINY_PNG_1x1, transformation: { width: 1, height: 1 }, type: 'png' }),
              ],
            }),
            new Paragraph({ text: 'Capítulo 3 — Fim', heading: HeadingLevel.HEADING_1 }),
          ],
        },
      ],
    });
    const buf = await Packer.toBuffer(doc);
    idempotentWrite('livro-3-capitulos.docx', buf);
  }

  // ── livro-com-tabela-complexa.docx ────────────────────────────────────────
  {
    const doc = new Document({
      sections: [
        {
          children: [
            new Paragraph({ text: 'Documento com tabela complexa', heading: HeadingLevel.HEADING_1 }),
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: [
                new TableRow({
                  children: [
                    new TableCell({ children: [new Paragraph({ children: [new TextRun('Célula A1')] })] }),
                    new TableCell({ children: [new Paragraph({ children: [new TextRun('Célula A2')] })] }),
                  ],
                }),
                new TableRow({
                  children: [
                    new TableCell({ children: [new Paragraph({ children: [new TextRun('Célula B1')] })] }),
                    new TableCell({ children: [new Paragraph({ children: [new TextRun('Célula B2')] })] }),
                  ],
                }),
              ],
            }),
          ],
        },
      ],
    });
    const buf = await Packer.toBuffer(doc);
    idempotentWrite('livro-com-tabela-complexa.docx', buf);
  }

  // ── livro.md ───────────────────────────────────────────────────────────────
  idempotentWrite(
    'livro.md',
    `# Livro de Teste

## Capítulo 1

Este é um parágrafo de texto para o primeiro capítulo do manuscrito de teste.

## Capítulo 2

Mais conteúdo textual aqui.

![Imagem de exemplo](./img.png)
`,
  );

  // ── livro.pdf ─────────────────────────────────────────────────────────────
  // PDF mínimo válido (magic bytes) — suficiente para disparar 415 antes de qualquer parse.
  idempotentWrite(
    'livro.pdf',
    Buffer.from(
      '%PDF-1.0\n1 0 obj\n<</Type /Catalog>>\nendobj\nxref\n0 2\n0000000000 65535 f \n0000000009 00000 n \ntrailer\n<</Size 2 /Root 1 0 R>>\nstartxref\n%%EOF',
    ),
  );

  // ── livro-corrompido.docx ─────────────────────────────────────────────────
  // 100 bytes aleatórios — não é ZIP válido, dispara 422 parse-failed.
  idempotentWrite('livro-corrompido.docx', randomBytes(100));

  // ── livro-51mb.docx ───────────────────────────────────────────────────────
  // 53 690 000 bytes > 52 428 800 (50 MiB cap) → dispara 413 file-too-large.
  // NÃO commitado no git (está em .gitignore).
  idempotentWrite('livro-51mb.docx', Buffer.alloc(53_690_000));

  out('\nFixtures prontos em test/fixtures/');
}

main().catch((err: unknown) => {
  process.stderr.write(`Erro ao gerar fixtures: ${String(err)}\n`);
  process.exit(1);
});
