<!-- OUTPUT-SCHEMA
- System Boundary
- External Actors and Systems
- End-to-End Flows
- Internal Boundaries
- Cross-cutting Concerns
-->

# 02 — Architecture Blueprint

**Module:** IMP — Importação · **Service:** `imp-service` · **Stack:** NestJS 11 + Prisma + PostgreSQL 16

## System Boundary

Import is a bounded-context NestJS module (`imp`) inside the Cordelê modular monolith
(ADR-002 modular-monolith). It is responsible for everything between "a file arrives" and "a frozen,
structured `Manuscrito` exists and has been announced". It owns the `Manuscrito` aggregate and the
parsing pipeline.

Inside the boundary:
- Accepting an upload (format + size validation), staging the binary in file storage.
- Parsing DOCX/Markdown into the canonical content tree.
- Extracting images and recording unparsed segments.
- Persisting the immutable `Manuscrito` and emitting `ManuscriptImported`.

Outside the boundary (consumed or handed off, never owned here):
- `ProjetoEditorial` lifecycle and the `Editora` (tenant) registry — owned by Projects (PROJ).
- Metadata and layout — owned by Composition (COMP).
- ePub/PDF build and epubcheck — owned by Publication (PUB).

## External Actors and Systems

- **Coordenador(a) Editorial** — uploads the manuscript through the Angular frontend.
- **Cordelê BFF (NestJS)** — the single entry point (TECH-003); the Import module is reached only
  through it. The frontend never touches storage or the database directly.
- **File Storage** — POC: local disk (ADR-007); production: S3-compatible object storage. Holds the
  original binary and extracted images. Import writes; downstream contexts read by reference.
- **PostgreSQL 16** — persists the `Manuscrito` row and its serialized content tree, scoped to the
  tenant schema.
- **No message broker** — `stack.messaging.enabled = false`. Domain events are in-process only
  (NestJS event emitter); there is no cross-service async fabric in the POC.
- **No external APIs and no AI provider** — parsing is fully local and deterministic.

## End-to-End Flows

**Golden path — import a manuscript**

1. Editor selects a `.docx`/`.md` file (≤ 50 MB) on the Upload screen (T03); the BFF receives the
   multipart request within the active `EmpresaContext`.
2. Import validates format and size; rejects anything else with a typed error (no partial import).
3. The original binary is stored in file storage under a tenant-scoped key; the storage reference is
   captured.
4. The format-specific parser adapter runs — **mammoth** for DOCX, **remark** for Markdown —
   producing the content tree (chapters, sections, paragraphs, images) plus a list of unparsed
   segments.
5. Embedded/referenced images are extracted to storage; the tree references them by storage key.
6. Import assembles counts (`totalCapitulos`, `totalImagens`, `trechosNaoParseados`) and persists an
   immutable `Manuscrito` bound to the `ProjetoEditorial` and `Editora`.
7. `ManuscriptImported` is emitted in-process; the project is nudged from `rascunho` toward
   `em_composicao`.
8. The editor is taken to Structure Review (T04): counts, chapter outline and any unparsed segments
   are shown for a human check.

**Alternative — unsupported or oversized file:** validation fails before any storage write; the
editor gets an explanatory error and stays on Upload. Nothing is persisted.

**Alternative — parse produces unparsed segments:** the import still succeeds and is persisted; the
unparsed count is non-zero and the segments are surfaced verbatim in Structure Review. Content is
never dropped to force a "clean" parse.

**Alternative — re-upload:** a new upload creates a **new** `Manuscrito` (immutability); the previous
one is not mutated.

## Internal Boundaries

Hexagonal layering per ADR-001 (hexagonal-node), directories as layers, the `imp` module as the
bounded context:

- **domain/** — `Manuscrito` aggregate, the content-tree value objects (Chapter, Section, Paragraph,
  Image, UnparsedSegment), and ports: inbound `ImportManuscriptUseCase`; outbound
  `ManuscriptParserPort`, `ManuscriptRepositoryPort`, `FileStoragePort`. No `@nestjs/*`, no
  `@prisma/client` here.
- **modules/imp/** (application) — `ImpModule`, controller, and the use-case service that
  orchestrates validate → store → parse → persist → emit. Transaction boundary lives here.
- **infrastructure/** — Prisma repository adapter + mappers, DOCX (mammoth) and Markdown (remark)
  parser adapters, and the file-storage adapter (local disk / S3). Bound to domain ports via
  `Symbol` DI tokens in the module's `providers`.

The dependency rule points inward: parsers and persistence depend on the domain contract, never the
reverse. Format-specific code is confined to adapters; the use case knows only `ManuscriptParserPort`.

## Cross-cutting Concerns

- **Multi-tenancy (ADR-003).** `EmpresaContext` (AsyncLocalStorage, RULE-07) carries the tenant on
  every request; the Prisma adapter targets the tenant schema (`emp_<slug>`), shared registry in
  `cordele_global`. No cross-tenant read is possible from within Import.
- **Security & confidentiality (framing §2.7).** Manuscripts may be unpublished creative work;
  binaries and extracted images live under tenant-scoped keys with access restricted to the owning
  project. LGPD applies (`_extensions.compliance.lgpd = true`).
- **Observability.** Structured logs and pipeline events per upload/parse, correlated by
  `trace_id`; parse diagnostics (counts, unparsed segments, duration) are first-class.
- **Validation & error handling.** Format/size checks and typed domain errors before any side
  effect; parsing failures degrade to unparsed segments rather than aborting a salvageable import.
- **Resource safety.** 50 MB cap and streamed parsing to bound memory; long parses run within the
  request lifecycle (no broker to offload to in the POC).
