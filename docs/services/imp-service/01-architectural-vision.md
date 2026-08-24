<!-- OUTPUT-SCHEMA
- Intent
- Problem Statement
- Personas
- MVP Scope
- Out of Scope
- Architectural Principles
- Success Signals
-->

# 01 — Architectural Vision

**Module:** IMP — Importação (Import)
**Bounded context:** Import
**Backend service:** `imp-service` (`@cordele`)
**Stack:** Node 22 · NestJS 11 · Prisma · PostgreSQL 16

## Intent

Import is the data entry point of Cordelê. It receives an author's manuscript in DOCX or
Markdown and turns it into a structured, machine-readable content tree — chapters, sections,
paragraphs and images — that every downstream context (Composition, Publication) consumes to
produce a valid ePub 3 and PDF. The context exists so that the rest of the platform never has to
touch a raw `.docx` or `.md` file again: after Import, the manuscript is a normalized aggregate
with a stable shape.

Import carries the platform's most load-bearing promise: **the system never alters the author's
content**. It structures and formats; it does not rewrite. Anything it cannot confidently parse is
preserved and surfaced as an *unparsed segment*, never silently dropped or "fixed".

## Problem Statement

Independent publishers (20–80 titles/year) receive manuscripts as Word documents or Markdown and
today re-diagram each one by hand to reach a distributable ePub — slow, error-prone, and requiring
technical skill the editorial team does not have. The raw formats are also lossy in opposite ways:
DOCX carries styling noise and inconsistent heading usage, while Markdown is clean but under-
specifies editorial structure. There is no shared, reliable representation of "what the book
actually contains" that tooling can build on.

Import solves the first mile: convert both formats **deterministically** into one canonical content
tree, quantify what was understood (chapter/image counts) and — critically — what was not
(unparsed-segment count), and freeze the result as an immutable `Manuscrito` that anchors the whole
editorial project. Without this context there is no trustworthy input for layout, metadata or export.

## Personas

- **Coordenador(a) Editorial (primary).** Marina, editorial coordinator at an independent house
  (Editora Aetós, the pilot tenant). Uploads the manuscript, needs immediate, honest feedback on
  what was imported and what needs a human look, and must trust that no text was altered.
- **Time interno de desenvolvimento (secondary).** Engineers integrating Composition and
  Publication against the content tree; they need a stable, versioned parse contract and clear
  parse diagnostics.

## MVP Scope

- Upload of a manuscript in **DOCX** or **Markdown** (single file, ≤ 50 MB), always through the
  BFF — the frontend never writes to storage directly.
- Deterministic parsing into a canonical content tree: chapters, sections, paragraphs, images.
- Explicit detection, counting and preservation of **unparsed segments** (`trechosNaoParseados`).
- Extraction of embedded images from DOCX and referenced images from Markdown into file storage.
- Persistence of the parse result as an **immutable `Manuscrito`** aggregate (format, filename,
  counts, serialized structure) bound to a `ProjetoEditorial` and to the owning `Editora` (tenant).
- Emission of the anchor domain event **`ManuscriptImported`** so the project transitions toward
  composition.

## Out of Scope

- Editing manuscript text — Cordelê is not a text editor; the original content is read-only.
- Metadata and layout configuration (owned by Composition / COMP).
- ePub/PDF generation and epubcheck validation (owned by Publication / PUB).
- Project lifecycle, listing and history (owned by Projects / PROJ).
- Formats beyond DOCX and Markdown (no ODT, RTF, HTML, PDF ingestion).
- Complex tables, mathematical equations and deeply nested footnotes — surfaced as unparsed
  segments rather than parsed.
- Any generative-AI assistance (deterministic conversion only in the POC).

## Architectural Principles

1. **Content is sacrosanct.** No byte of author text is modified, reordered or removed. Structuring
   is additive metadata over the original content.
2. **Lossless by disclosure.** What cannot be parsed is preserved verbatim and reported as an
   unparsed segment; the system is transparent about what it did and did not understand.
3. **Immutable after import.** A `Manuscrito` is frozen once created; a new upload is a new
   manuscript, never an in-place mutation.
4. **Deterministic parsing.** Same input file ⇒ same content tree. No heuristics whose output
   depends on time, model state or external calls.
5. **Hexagonal boundary (ADR-001 hexagonal-node).** Domain owns the parse contract as ports; DOCX
   and Markdown parsers and file storage are infrastructure adapters swapped behind DI tokens.
6. **Tenant isolation by construction.** Every manuscript belongs to exactly one `Editora`;
   persistence and storage are scoped by `EmpresaContext` (RULE-07), never by a caller-supplied id.
7. **BFF is the only gateway.** Upload, storage and parse are reached exclusively through the BFF.

## Success Signals

- A DOCX or Markdown upload produces a content tree whose chapter, section and image counts match
  the source, with unparsed segments reported rather than lost.
- Re-uploading the same file yields an identical content tree (determinism holds).
- Downstream contexts (COMP, PUB) build layout and export from the tree without ever re-reading the
  original binary.
- Zero incidents of altered or dropped author content across pilot manuscripts.
- The immutable `Manuscrito` and its `ManuscriptImported` event reliably move a project from
  `rascunho` toward `em_composicao`.
