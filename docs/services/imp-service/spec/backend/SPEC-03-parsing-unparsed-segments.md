# SPEC-03 — Deterministic Parsing & Unparsed-Segment Detection (critical sub-feature)

**Module:** IMP · **Refs:** `adr/ADR-002-manuscript-immutability-lossless-parse.md`, doc 01 principles
1–4, `contracts/api-contract.md` §6.2/§6.3, `contracts/integration-contracts.md` §2.

## Objetivo

Especificar o comportamento de `ManuscriptParserPort` e seus adapters (`mammoth`/DOCX, `remark`/Markdown):
converter deterministicamente o arquivo no **content tree** canônico e **preservar/reportar** tudo que
não puder estruturar como `UnparsedSegment` — nunca alterar nem descartar conteúdo.

## Escopo

- **In:** contrato do port; produção do content tree (§6.2); taxonomia de unparsed (§6.3); determinismo;
  extração de imagens.
- **Out:** orquestração (SPEC-02); persistência (SPEC-04).

## Decisões técnicas

- `parse(stream, formato) → { contentTree, unparsedSegments, counts }`. O port **exige** reportar regiões
  não estruturáveis (contrato testável do ADR-002).
- DOCX: style map determinístico (mammoth). Markdown: AST (remark). Mesmo input ⇒ mesmo tree.
- Content é sacrossanto: texto de parágrafo preservado verbatim; formatação inline vira `runs[].marks`
  sem alterar `text`.

## Implementação

- Nós: `chapter → section → block[]`; `block ∈ {paragraph, image, unparsed}` (discriminado por `type`).
- `id` único no tree; `order` contíguo (0..n) entre irmãos.
- Unparsed `reason ∈ {complex_table, math_equation, nested_footnote, unknown_docx_style,
  unsupported_markup, embedded_object, other}`; `sourceLocation.kind` = `formato`.
- Imagens: embutidas (DOCX) / referenciadas (Markdown) normalizadas para o mesmo VO `Image{storageKey,
  mime, alt?, order}`.

## Casos de borda

- Tabela complexa / equação / footnote aninhada / estilo DOCX desconhecido → `unparsed` com `reason`.
- Markdown que referencia imagem inexistente → `unparsed` (`unsupported_markup`) ou imagem ausente
  reportada; nunca crash silencioso.
- Documento sem capítulos explícitos → um capítulo implícito `order:0` contendo os blocks.

## Critérios de aceite (EARS)

- `THE SYSTEM SHALL produce an identical content tree for identical input and formato (determinism).`
- `THE SYSTEM SHALL preserve every paragraph's text exactly as authored.`
- `IF a region cannot be confidently structured, THEN THE SYSTEM SHALL emit an UnparsedSegment carrying
  rawContent, a reason from the closed enum, and a sourceLocation matching formato — never dropping it.`
- `THE SYSTEM SHALL ensure the union of paragraph, image and unparsed nodes accounts for the whole source.`
- `THE SYSTEM SHALL assign each node a unique id and a gap-free order among siblings starting at 0.`
- `WHEN runs are present on a paragraph, THE SYSTEM SHALL make the concatenation of runs[].text equal to
  text.`
