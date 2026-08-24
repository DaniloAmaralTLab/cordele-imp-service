<!-- OUTPUT-SCHEMA
- Ubiquitous Language
- Aggregates and Entities
- Domain Events
- State Transitions
- Invariants
-->

# 03 — Initial Domain Framing

**Module:** IMP — Importação · **Bounded context:** Import

## Ubiquitous Language

| Term | Meaning |
|---|---|
| Manuscript (`Manuscrito`) | The original file after parsing; immutable once imported. The aggregate root of this context. |
| Content tree (`estrutura`) | Canonical, serialized representation of the manuscript: ordered chapters → sections → paragraphs and images. |
| Chapter / Section / Paragraph | Structural nodes of the content tree, in document order. |
| Image | A visual asset extracted (DOCX) or referenced (Markdown), stored by key and referenced from the tree. |
| Unparsed segment (`trechoNaoParseado`) | A run of source content the parser could not confidently structure; preserved verbatim and reported, never dropped. |
| Format (`formato`) | The source type: `docx` or `markdown`. |
| Import | The act of turning an uploaded file into an immutable manuscript with a content tree. |
| Editorial Project (`ProjetoEditorial`) | The project a manuscript belongs to (owned by PROJ context; referenced here). |
| Editora | The publishing house — the tenant that owns the project and manuscript. |

## Aggregates and Entities

**Aggregate root: `Manuscrito`** (owned by Import)

- `id` (pk), `projetoId` → `ProjetoEditorial`, `nomeArquivo`, `formato` (`docx | markdown`)
- `totalCapitulos`, `totalImagens`, `trechosNaoParseados` (int diagnostics)
- `estrutura` — serialized content tree (JSON); the canonical structured content
- Storage reference to the original binary (tenant-scoped key)

Value objects inside the aggregate (not independently persisted rows in the POC; serialized within
`estrutura`):

- `Chapter`, `Section`, `Paragraph` — ordered structural nodes
- `Image` — `{ storageKey, alt?, order }`
- `UnparsedSegment` — `{ rawContent, sourceLocation, reason }`

Referenced from outside the boundary (not owned here): `ProjetoEditorial`, `Editora`.

## Domain Events

- **`ManuscriptImported` (anchor event)** — raised when an immutable manuscript is successfully
  persisted. Payload: `manuscritoId`, `projetoId`, `editoraId`, `formato`, `totalCapitulos`,
  `totalImagens`, `trechosNaoParseados`. In-process only (no broker; `messaging.enabled = false`);
  consumers (e.g. project-status transition toward `em_composicao`) subscribe within the monolith.
- **`ManuscriptImportRejected`** — raised when validation fails (unsupported format / oversize).
  Payload: `projetoId`, `reason`. No manuscript is created.

Both are past-tense facts. The POC has no event broker, so events are dispatched via the in-process
NestJS event emitter and must not be relied upon for cross-process delivery.

## State Transitions

A manuscript itself has a trivial lifecycle by design (immutability):

```
(none) --import success--> IMPORTED   [terminal — never mutated in place]
(none) --validation fail--> (no manuscript created)
re-upload --> new IMPORTED manuscript (previous one untouched)
```

Import contributes to the surrounding project lifecycle (owned by PROJ):

```
ProjetoEditorial.status: rascunho --ManuscriptImported--> em_composicao
```

## Invariants

1. **Immutability.** Once `IMPORTED`, a `Manuscrito` is never modified; corrections happen by
   importing a new manuscript.
2. **Content preservation.** The union of parsed nodes and unparsed segments accounts for the whole
   source; no source content is discarded. `trechosNaoParseados` is an honest count, not a
   suppression.
3. **Format closure.** `formato ∈ {docx, markdown}`; any other input is rejected before persistence.
4. **Size bound.** Source file ≤ 50 MB (TECH constraint); enforced before any storage write.
5. **Tenant ownership.** Every manuscript belongs to exactly one `Editora` and one
   `ProjetoEditorial`; both are set at import time and never reassigned.
6. **Counts consistency.** `totalCapitulos`, `totalImagens` and `trechosNaoParseados` are derived
   from `estrutura` at import and are consistent with it.
7. **No content mutation.** Structuring adds metadata around the original text; it never edits the
   text itself.
