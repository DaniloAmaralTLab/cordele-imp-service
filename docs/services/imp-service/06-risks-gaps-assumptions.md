<!-- OUTPUT-SCHEMA
- Riscos
- Gaps Conhecidos
- Suposicoes a Validar
- Dependencias Criticas
-->

# 06 — Risks, Gaps and Assumptions

**Module:** IMP — Importação

## Riscos

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| R1 | DOCX variety — inconsistent heading styles, styling noise — yields a wrong or shallow chapter/section structure. | Downstream layout/export is built on a bad tree. | Deterministic mammoth style map + explicit unparsed-segment capture; Structure Review (T04) puts a human in the loop before composition. |
| R2 | Content loss or silent alteration during parsing. | Breaks the platform's core promise (framing §2.1). | Immutability + lossless-by-disclosure invariants (local ADR-002); union of parsed + unparsed must cover the whole source; automated tests asserting no content dropped. |
| R3 | Large / pathological files exhaust memory or time (synchronous parse, no broker). | Request timeouts, degraded UX. | 50 MB cap enforced pre-storage; streamed parsing; post-POC async path kept open behind the port. |
| R4 | Malicious upload (macro-laden DOCX, zip bomb, oversized images). | Security exposure on the BFF host. | Size/format validation before processing; storage under tenant-scoped keys; future malware-scan adapter behind `FileStoragePort`. |
| R5 | Image extraction mismatch — DOCX-embedded vs Markdown-referenced images resolved inconsistently. | Broken references in the ePub later. | Single `Image` value object with a storage key; adapters normalize both cases into the same tree shape. |
| R6 | Multi-tenancy model mismatch between control plane (schema-per-tenant) and BA POC (single-tenant). | Wrong isolation assumptions baked into persistence. | Follow control-plane schema-per-tenant; flag as an assumption to confirm (A1) before scaffold. |

## Gaps Conhecidos

- **Content-tree schema not yet formalized.** The exact JSON shape of `estrutura` (node types,
  ordering, image/unparsed-segment representation) is defined at the Specs phase, not here.
- **Unparsed-segment taxonomy undefined.** What counts as "unparsed" (tables, equations, nested
  footnotes, unknown styles) and how `reason`/`sourceLocation` are represented needs a concrete
  contract.
- ~~**Tenant provisioning / per-schema migration** is a shared platform mechanism (Prisma vs
  schema-per-tenant) not yet designed; noted for scaffold/infra.~~ **Resolved (D-619):** dynamic
  `PrismaClient` per tenant, `datasourceUrl` resolved from `EmpresaContext`, LRU-evicted registry.
  See `ADR-003-multi-tenancy.md` § Resolution.
- **Deletion & LGPD erasure** across PROJ → IMP (cascade of binaries and rows) is unspecified.
- **Parse limits** (max chapters, max image size/count) not yet quantified.
- **Idempotency of upload** (same file re-submitted) — currently "new manuscript each time"; whether
  to dedupe by content hash is open.

## Suposicoes a Validar

- **A1** — Multi-tenancy is schema-per-tenant multi-empresa (`cordele_global` + `emp_<slug>`), per
  the control plane, overriding the BA POC single-tenant simplification. **Confirm before scaffold.**
- **A2** — DOCX parsing uses `mammoth` and Markdown uses `remark`, both behind
  `ManuscriptParserPort`; no other formats in the POC.
- **A3** — The content tree is stored serialized in a single `estrutura` column (document-style),
  not exploded into relational node tables, for the POC.
- **A4** — Parsing runs synchronously in the request; no broker (`messaging.enabled = false`); domain
  events are in-process only.
- **A5** — 50 MB is the accepted upper bound for a manuscript upload.
- **A6** — Import references but does not own `ProjetoEditorial`/`Editora`; the project is created
  (PROJ) before or at upload time.
- **A7** — No AI and no external API participate in Import (`ai.hasAi = false`).

## Dependencias Criticas

- **PostgreSQL 16 + Prisma** — persistence of the immutable `Manuscrito` and tenant-schema targeting.
- **File storage** (local disk POC / S3 prod) behind `FileStoragePort` — original binary and
  extracted images.
- **`mammoth` and `remark`** parser libraries — the deterministic engines behind the parser adapters.
- **`EmpresaContext` / RULE-07** — tenant propagation; without it, tenant isolation cannot be
  enforced.
- **Projects context (PROJ)** — provides `ProjetoEditorial` / `Editora` that a manuscript binds to,
  and consumes `ManuscriptImported` to advance project status.
- **BFF (NestJS)** — the sole entry point for upload (TECH-003).
