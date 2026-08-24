# Integration Contracts — imp-service (Importação)

**Module:** IMP · **Governing ADR:** shared `docs/architecture/backend/adr/ADR-001-hexagonal-node.md`
(every integration is an infrastructure adapter behind a domain port).

Import has **no third-party API, no broker, no AI provider** (doc 04). Its integrations are: (1) file
storage, (2) the parser libraries, and (3) one **in-process** cross-context dependency on PROJ.

---

## 1. File storage — `FileStoragePort`

Stores the original binary and extracted images under tenant-scoped keys.

- **Port (domain):** `FileStoragePort` — `put(key, stream, mime): Promise<void>`,
  `get(key): Promise<Stream>`, `delete(key): Promise<void>`.
- **Adapters (infrastructure):** local-disk (POC, ADR-007 BA); S3-compatible object storage (prod).
  Selected by DI token; the use case never names an adapter.
- **Key scheme:** `emp_<slug>/manuscritos/<manuscritoId>/<original|img-N>.<ext>` — always tenant-scoped
  from `EmpresaContext` (never a caller-supplied path).
- **Auth:** local disk none; S3 via client credentials / IAM (adapter config, not domain).
- **SLA / limits:** bounded by the 50 MB upload cap; streamed writes to bound memory.
- **Fallback:** none in POC — a storage failure fails the import (the manuscript is not persisted).
  `IF the binary cannot be stored, THEN THE SYSTEM SHALL abort the import and persist no manuscrito.`

**EARS:**

- `WHEN parsing extracts an image, THE SYSTEM SHALL store it under the tenant-scoped key and reference it
  from the content tree by that key.`
- `THE SYSTEM SHALL store the original binary before returning a successful upload response.`

---

## 2. Parser libraries — `ManuscriptParserPort`

The deterministic conversion engines, confined to adapters (doc 04, assumption A2).

- **Port (domain):** `ManuscriptParserPort` — `parse(stream, formato): Promise<ParseResult>` where
  `ParseResult = { contentTree, unparsedSegments, counts }`. The contract **requires** the adapter to
  **report** regions it cannot structure as `UnparsedSegment` rather than drop them (local ADR-002).
- **Adapters (infrastructure):**
  - `docx-mammoth.adapter` — **`mammoth`** (DOCX → structure) with a deterministic style map.
  - `markdown-remark.adapter` — **`remark`** (Markdown AST).
  - Adapter chosen per `formato` behind the port; the use case never names mammoth/remark.
- **Determinism:** same input ⇒ same content tree (doc 01 principle 4); no time/model/network dependence.
- **Auth / rate limits / SLA:** none (in-process libraries).

**EARS:**

- `THE SYSTEM SHALL select the parser adapter solely from formato, behind ManuscriptParserPort.`
- `IF the parser encounters a region it cannot confidently structure, THEN THE SYSTEM SHALL emit an
  UnparsedSegment (raw content + reason + sourceLocation), never discard it.`
- `THE SYSTEM SHALL produce an identical content tree for identical input (determinism).`

---

## 3. PROJ context — in-process inbound port (decision D-C)

Import references `ProjetoEditorial`/`Editora` (owned by PROJ / global) and, for the create-and-upload
flow (T03), creates the project **through PROJ**, never by writing PROJ tables.

- **Dependency:** IMP application service depends on the **PROJ inbound ports**, exported by the PROJ
  NestJS module and injected by DI token (in-process; same monolith, same request/transaction):
  - `CreateProjetoEditorialUseCase.create({ titulo }): Promise<{ projetoId }>` — used when the upload
    carries `projetoTitulo`.
  - `ProjetoEditorialLookup.exists(projetoId): Promise<boolean>` (scoped to the active empresa) — used to
    validate an incoming `projetoId`.
- **Ownership boundary:** PROJ is the **sole writer** of `projeto_editorial`; IMP only calls the port and
  reads by reference. IMP's Prisma repository never issues INSERT/UPDATE on `projeto_editorial`.
- **Transaction:** the create-then-import runs within one request; project creation precedes parse so
  the manuscrito can be bound. If parse fails after project creation, the created project remains (a
  `rascunho` with no manuscript) — acceptable; a re-upload can target it via `projetoId`.
- **Fallback:** none — `IF project creation or validation through the PROJ port fails, THEN THE SYSTEM
  SHALL reject the upload (422) and persist no manuscrito.`

**EARS:**

- `WHEN the upload carries projetoTitulo, THE SYSTEM SHALL create the project via
  CreateProjetoEditorialUseCase before parsing and bind the manuscrito to the returned projetoId.`
- `WHEN the upload carries projetoId, THE SYSTEM SHALL validate it via ProjetoEditorialLookup within the
  active empresa before parsing.`
- `THE SYSTEM SHALL never write the projeto_editorial table directly from the IMP context.`

> **Scaffold note (M4):** the PROJ inbound ports above are the IMP→PROJ contract. If PROJ is scaffolded
> after IMP, provide thin port stubs so IMP compiles; the real implementation lands with PROJ.

---

## 4. Summary table

| Integration | Port | Adapter(s) | Transport | Fallback |
|---|---|---|---|---|
| File storage | `FileStoragePort` | local-disk / S3 | library / SDK | none (fail import) |
| DOCX parse | `ManuscriptParserPort` | `mammoth` | in-process lib | segment → unparsed |
| Markdown parse | `ManuscriptParserPort` | `remark` | in-process lib | segment → unparsed |
| Project create/validate | PROJ inbound ports | PROJ module | **in-process DI** | none (reject upload) |

---

## 5. Addendum — PROJ `AdvanceProjetoStatusUseCase` port (phase M4, confirm-estrutura)

In-process call added by the T04 "Confirmar estrutura" action (api-contract.md §8.2). IMP calls PROJ
to advance `ProjetoEditorial.status` from `rascunho` to `em_composicao` **without writing the PROJ
table itself** (decision D-C still applies).

- **Dependency:** IMP application service (`ConfirmEstruturaUseCase`) depends on PROJ's exported port:
  - `AdvanceProjetoStatusUseCase.advanceTo({ projetoId, targetStatus: 'em_composicao' }): Promise<{ projetoId, newStatus }>`
- **IMP↔PROJ agreement:**
  - PROJ validates that `rascunho → em_composicao` is a legal transition.
  - If the project is already `em_composicao` or later, PROJ returns `{ projetoId, newStatus }` without error (idempotent — IMP never regresses status).
  - If the project does not exist or belongs to another empresa, PROJ throws and IMP surfaces `422 urn:cordele:imp:status-advance-failed`.
- **Scaffold note (M4):** provide a thin stub of `AdvanceProjetoStatusUseCase` so IMP compiles. Real implementation lands with PROJ module.
