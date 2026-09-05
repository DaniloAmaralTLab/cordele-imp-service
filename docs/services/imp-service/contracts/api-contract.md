# API Contract — imp-service (Importação)

**Module:** IMP · **Service:** `imp-service` · **Stack:** Node 22 · NestJS 11 · Prisma · PostgreSQL 16
**Base path:** `/api/imp` (served through the single BFF — TECH-003; the frontend never writes to storage or DB directly)
**Governing ADRs:** shared `docs/architecture/backend/adr/ADR-001-hexagonal-node.md` (hexagonal boundary),
`ADR-002-modular-monolith.md`, `ADR-003-multi-tenancy.md`; local `adr/ADR-001-service-boundary.md`,
`adr/ADR-002-manuscript-immutability-lossless-parse.md`.
EARS acceptance criteria per endpoint follow `docs/architecture/backend/standards/ears-notation.md`.

---

## 0. Authoritative decisions resolved in this contract

Three decisions were open at the end of the Vision phase (doc 06 gaps, M1 handoff warnings). They are
resolved here and are **binding on downstream phases**, including the FE Specs phase (M3).

### D-A — Parse is SYNCHRONOUS in the request cycle (BE is authoritative)

`POST /api/imp/manuscripts` **parses the file inside the request and returns the fully parsed,
persisted `Manuscrito` (content tree included) in the same response.**

- There is **NO** `parseJobId`, **NO** `202 Accepted`, and **NO** parse-status polling endpoint.
- The successful response is `201 Created` with the complete `ManuscritoDetail` (including `estrutura`).
- This follows doc 04 (*Async vs Sync Decisions*) and doc 06 assumption **A4**: with no broker
  (`messaging.enabled=false`) there is nowhere to offload to, and the editor waits on Structure Review
  anyway. The 50 MB cap plus streamed parsing bounds the request.

> **BE overrides FE ADR-IMP-001.** The frontend ADR `ADR-IMP-001-parse-progress-polling` assumed a
> two-phase `POST → {parseJobId} → GET polling` flow. That assumption is **rejected as the server
> contract**. The BE is authoritative on transport shape. **M3 (FE Specs) MUST rewrite or downgrade
> ADR-IMP-001** to the synchronous shape: a single `POST` that returns the parsed manuscript, with the
> UI showing an indeterminate "analisando estrutura…" indicator for the duration of the request (no
> polling loop, no `parseJobId`). `GET /api/imp/manuscripts/{id}` remains available for **reload /
> deep-link / resume**, but it is a plain resource read, never a readiness probe.

### D-B — `Manuscrito.status` field is modelled anyway (async path kept open)

Even though the MVP flow is synchronous, `Manuscrito` carries a `status` field (see `data-model.md`).
In the synchronous MVP a persisted manuscript is always returned with `status = "imported"`. The enum
reserves `"parsing"` and `"import_failed"` for a **post-POC asynchronous path** (doc 04 *Future async
path*) so it can be introduced **without a breaking schema or payload change** — the field, the enum
domain, and the `GET` resource already exist. The MVP simply never emits a non-terminal status.

### D-C — Ownership of `ProjetoEditorial` (who creates it, and how)

`ProjetoEditorial` is **owned by the PROJ context** (doc 04, doc 05); IMP references it and never writes
its table. The prototype screen T03 creates the project at the moment of upload. This is reconciled as
follows and is **unambiguous for the FE upload screen**:

The upload request carries **exactly one** of two mutually exclusive project bindings:

| Field (multipart) | Meaning | IMP behaviour |
|---|---|---|
| `projetoId` (UUID) | attach the manuscript to a **pre-existing** project | IMP validates the project exists and belongs to the active tenant (via the PROJ inbound port), then binds. IMP **does not** create anything. |
| `projetoTitulo` (string) | create-and-upload in **one action** (the T03 flow) | IMP calls the **PROJ inbound port `CreateProjetoEditorialUseCase` in-process** (both are modules of the same monolith) to create the project, then binds the new manuscript to it. **PROJ remains the sole writer** of `projeto_editorial`; IMP never touches PROJ tables. |

- **EARS:** `IF the request supplies neither projetoId nor projetoTitulo, OR supplies both, THEN THE
  SYSTEM SHALL reject the request with 400 (problem type urn:cordele:imp:invalid-project-binding).`
- **EARS:** `WHEN the request supplies projetoId, THE SYSTEM SHALL verify the project exists in the
  active empresa and, IF it does not, THEN reject with 422 (urn:cordele:imp:projeto-not-found).`
- **EARS:** `WHEN the request supplies projetoTitulo, THE SYSTEM SHALL create the ProjetoEditorial
  through the PROJ inbound port before parsing and bind the manuscript to the created project id.`

The in-process IMP→PROJ dependency is registered in `integration-contracts.md`. The FE upload screen
(T03) therefore sends `file` + (`projetoTitulo` for a new project **or** `projetoId` for an existing
one); it never invents a project id and never calls a project-creation endpoint separately for the
create-and-upload flow.

---

## 1. Conventions

- **Media type:** `application/json` for responses; `multipart/form-data` for the upload.
- **IDs:** UUID v4 (server-generated). Never client-supplied.
- **Timestamps:** RFC 3339 / ISO-8601 UTC (`criadoEm`).
- **Errors:** RFC 7807 `application/problem+json` (see §5).
- **Idempotency:** immutability by construction — each upload creates a **new** manuscript. Optional
  content-hash dedupe is reserved (see `data-model.md` §`content_hash`, `SPEC-05`), off in the MVP.

## 2. Authentication, authorization, tenancy

- **Auth:** OAuth2 Bearer JWT (`Authorization: Bearer <token>`). Unauthenticated → `401`.
- **Scopes:** `imp:write` (upload), `imp:read` (read manuscripts / content tree).
- **Tenant:** the owning `empresa` is taken **from the JWT claim** and applied via `EmpresaContext`
  (AsyncLocalStorage, RULE-07 / ADR-003). It is **never** read from the path, query or body.
  - **EARS:** `THE SYSTEM SHALL resolve the tenant schema exclusively from the authenticated principal's
    empresa claim.`
  - **EARS:** `IF a caller references a manuscritoId or projetoId that belongs to another empresa, THEN
    THE SYSTEM SHALL respond 404 (never revealing cross-tenant existence).`

## 3. Required headers

| Header | Direction | Notes |
|---|---|---|
| `Authorization: Bearer <jwt>` | request | required on every endpoint |
| `X-Correlation-Id` | request (optional) / response (always) | propagated to logs and pipeline events; generated if absent |
| `Content-Type: multipart/form-data` | request | upload only |
| `Content-Type: application/problem+json` | response | error responses |

---

## 4. Resources

### 4.1 `POST /api/imp/manuscripts` — upload + synchronous parse

Uploads a DOCX/Markdown file, parses it deterministically, persists an immutable `Manuscrito`, emits
`ManuscriptImported`, and returns the parsed result **in the same response** (decision D-A).

**Scope:** `imp:write` · **Request:** `multipart/form-data`

| Part | Type | Required | Notes |
|---|---|---|---|
| `file` | binary | yes | `.docx` or `.md`; `≤ 50 MB` (52428800 bytes) |
| `projetoId` | text (UUID) | conditional | existing project (see D-C); mutually exclusive with `projetoTitulo` |
| `projetoTitulo` | text | conditional | create-and-upload; mutually exclusive with `projetoId` |

**Success — `201 Created`**, body = `ManuscritoDetail` (§6.1), `Location: /api/imp/manuscripts/{id}`.

Acceptance criteria (EARS):

- `WHEN a supported file (docx|markdown) within the size cap is uploaded with a valid project binding,
  THE SYSTEM SHALL parse it, persist an immutable Manuscrito, emit ManuscriptImported, and respond 201
  with the full ManuscritoDetail including estrutura and status="imported".`
- `IF the file extension/content is not docx or markdown, THEN THE SYSTEM SHALL respond 415
  (urn:cordele:imp:unsupported-format) and persist nothing.`
- `IF the file exceeds 52428800 bytes, THEN THE SYSTEM SHALL respond 413
  (urn:cordele:imp:file-too-large) before writing to storage.`
- `WHILE parsing yields regions it cannot structure, THE SYSTEM SHALL preserve them verbatim as
  unparsed segments, still respond 201, and report a non-zero trechosNaoParseados count.` (never drops
  content — local ADR-002)
- `IF parsing fails irrecoverably (corrupt/unreadable file), THEN THE SYSTEM SHALL respond 422
  (urn:cordele:imp:parse-failed), emit ManuscriptImportRejected, and persist no manuscript.`
- `THE SYSTEM SHALL store the original binary under a tenant-scoped key before returning success.`
- `THE SYSTEM SHALL guarantee that totalCapitulos, totalImagens and trechosNaoParseados equal the
  counts derivable from the returned estrutura.`

### 4.2 `GET /api/imp/manuscripts/{manuscritoId}` — read one manuscript

Plain resource read for **reload / deep-link / Structure Review hydration** (T04). **NOT a polling /
readiness probe** — in the synchronous MVP it always returns a terminal `status="imported"`.

**Scope:** `imp:read` · **Success — `200 OK`**, body = `ManuscritoDetail` (§6.1).

- `WHEN an existing manuscritoId of the active empresa is requested, THE SYSTEM SHALL return its full
  ManuscritoDetail.`
- `IF the manuscritoId does not exist in the active empresa, THEN THE SYSTEM SHALL respond 404.`

### 4.3 `GET /api/imp/manuscripts/{manuscritoId}/estrutura` — content tree only

Returns only the content tree (may be large); avoids re-sending diagnostics.

**Scope:** `imp:read` · **Success — `200 OK`**, body = `ContentTree` (§6.2).

- `WHEN an existing manuscritoId is requested, THE SYSTEM SHALL return its estrutura content tree
  conforming to the ContentTree schema (§6.2).`

### 4.4 `GET /api/imp/projetos/{projetoId}/manuscritos` — immutable import history

Lists the manuscripts imported into a project (newest first). Immutability makes this an append-only
history (re-uploads add rows; nothing is mutated).

**Scope:** `imp:read` · **Success — `200 OK`**, body = `ManuscritoSummary[]` (§6.3).

- `WHEN an existing projetoId of the active empresa is requested, THE SYSTEM SHALL return its
  manuscripts ordered by criadoEm descending (possibly empty).`
- `IF the projetoId belongs to another empresa or does not exist, THEN THE SYSTEM SHALL respond 404.`

---

## 5. Errors (RFC 7807 ProblemDetail)

All errors use `application/problem+json`. `type` is a stable URN; `traceId` mirrors `X-Correlation-Id`.

| `type` (URN) | HTTP | When |
|---|---|---|
| `urn:cordele:imp:unsupported-format` | 415 | file is not docx/markdown |
| `urn:cordele:imp:file-too-large` | 413 | file > 50 MB |
| `urn:cordele:imp:invalid-project-binding` | 400 | neither / both of projetoId, projetoTitulo |
| `urn:cordele:imp:projeto-not-found` | 422 | projetoId does not exist in the active empresa |
| `urn:cordele:imp:parse-failed` | 422 | file unreadable / irrecoverable parse error |
| `urn:cordele:imp:validation` | 400 | malformed request (missing file part, etc.) |
| `urn:cordele:imp:unauthorized` | 401 | missing/invalid token |
| `urn:cordele:imp:forbidden` | 403 | valid token lacking the required scope |
| `urn:cordele:imp:not-found` | 404 | manuscritoId/projetoId not in active empresa |

Example:

```json
{
  "type": "urn:cordele:imp:file-too-large",
  "title": "Manuscript exceeds the maximum upload size",
  "status": 413,
  "detail": "The file is 71.2 MB; the maximum is 50 MB.",
  "instance": "/api/imp/manuscripts",
  "traceId": "8b1f...c2"
}
```

---

## 6. Schemas

### 6.1 `ManuscritoDetail`

```json
{
  "id": "uuid",
  "projetoId": "uuid",
  "nomeArquivo": "livro-de-cordel.docx",
  "formato": "docx",
  "status": "imported",
  "totalCapitulos": 12,
  "totalImagens": 5,
  "trechosNaoParseados": 2,
  "tamanhoBytes": 8421000,
  "estrutura": { "...": "ContentTree — see §6.2" },
  "criadoEm": "2026-08-24T14:31:46Z"
}
```

- `formato ∈ {docx, markdown}`; `status ∈ {imported, parsing, import_failed}` (MVP always `imported`).
- `binarioStorageKey` is **not** exposed in the API surface (internal, tenant-scoped).

### 6.2 `ContentTree` (formalized — closes the M1 gap)

The canonical JSON shape of `estrutura`. The tree is an **ordered forest of chapters**; every node has
a stable `id` (unique within the tree) and an integer `order` giving document order among siblings.

```json
{
  "schemaVersion": "1.0",
  "formato": "docx",
  "chapters": [
    {
      "id": "ch-1",
      "order": 0,
      "title": "Capítulo I — A partida",
      "blocks": [ /* chapter-level blocks appearing before the first section */ ],
      "sections": [
        {
          "id": "sec-1-1",
          "order": 0,
          "title": "A carta",
          "blocks": [ /* Block[] */ ]
        }
      ]
    }
  ]
}
```

A **`Block`** is a discriminated union on `type`:

```json
// Paragraph — author text, preserved verbatim (content is sacrosanct)
{ "type": "paragraph", "id": "p-14", "order": 3,
  "text": "Era uma vez, no sertão...",
  "runs": [ { "text": "Era uma vez, no sertão...", "marks": ["italic"] } ] }

// Image — extracted (DOCX) or referenced (Markdown), stored by key
{ "type": "image", "id": "img-2", "order": 4,
  "storageKey": "emp_aetos/manuscritos/<id>/img-2.png",
  "mime": "image/png", "alt": "Mapa do sertão", "originalName": "mapa.png" }

// UnparsedSegment — preserved verbatim, never dropped (local ADR-002)
{ "type": "unparsed", "id": "u-1", "order": 7,
  "rawContent": "<w:tbl>...</w:tbl>",
  "reason": "complex_table",
  "sourceLocation": { "kind": "docx", "paragraphIndex": 212, "styleName": "TableGrid" } }
```

**Rules / invariants (EARS):**

- `THE SYSTEM SHALL assign every node a unique id within the tree and a contiguous, gap-free order
  among its siblings starting at 0.`
- `THE SYSTEM SHALL preserve paragraph text exactly as authored; runs carry inline formatting as marks
  over ranges without altering the text.` (`marks ⊆ {bold, italic, underline, strikethrough, code,
  superscript, subscript}`)
- `THE SYSTEM SHALL represent any region it cannot confidently structure as an UnparsedSegment node in
  document order, so that the union of paragraph/image/unparsed nodes accounts for the entire source.`
- `runs` is optional; when absent, `text` is the canonical content. When present, the concatenation of
  `runs[].text` MUST equal `text`.

### 6.3 Unparsed-segment taxonomy (formalized — closes the M1 gap)

`UnparsedSegment.reason` is a closed enum; `sourceLocation.kind` matches `formato`.

| `reason` | Meaning |
|---|---|
| `complex_table` | table structure beyond simple grids |
| `math_equation` | OMML / LaTeX / MathML equation |
| `nested_footnote` | footnotes nested or cross-referenced beyond flat notes |
| `unknown_docx_style` | a DOCX paragraph/character style outside the deterministic style map |
| `unsupported_markup` | Markdown/HTML construct not in the supported subset |
| `embedded_object` | OLE object, chart, SmartArt, embedded file |
| `other` | anything else the adapter could not classify (must still carry rawContent) |

`sourceLocation` union:

```json
{ "kind": "docx", "paragraphIndex": 212, "styleName": "TableGrid" }   // DOCX
{ "kind": "markdown", "line": 88, "column": 1 }                        // Markdown
```

- `THE SYSTEM SHALL populate reason from the closed enum above and sourceLocation with the kind matching
  the source format.`

### 6.4 `ManuscritoSummary`

```json
{ "id": "uuid", "projetoId": "uuid", "nomeArquivo": "...", "formato": "docx",
  "status": "imported", "totalCapitulos": 12, "totalImagens": 5,
  "trechosNaoParseados": 2, "criadoEm": "2026-08-24T14:31:46Z" }
```

---

## 7. Notes for the FE Specs phase (M3)

1. **Rewrite/downgrade ADR-IMP-001** to the synchronous single-`POST` shape (decision D-A). No
   `parseJobId`, no polling loop; show an indeterminate parse indicator while the `POST` is in flight.
2. **Upload screen (T03) project binding** (decision D-C): send `file` + `projetoTitulo` (create) **or**
   `file` + `projetoId` (existing). Never both, never neither.
3. On `201`, hydrate Structure Review (T04) directly from the response `estrutura` — no follow-up read
   required (though `GET /manuscripts/{id}` and `/estrutura` exist for reload/resume).

---

## 8. Addendum — T04 Editorial Actions (agreed phase M4, 2026-08-24)

> **Context:** Screen T04 ("Revisão de Estrutura") exposes two editor actions — "Ignorar fragmento"
> and "Confirmar estrutura" — that were previously client-only. This addendum closes the UX defects:
> - "Ignorar fragmento" was optimistic + client-only: on page refresh the ignored segment reappeared
>   (the server had no record of the editorial decision). Fix: persist the annotation server-side.
> - "Confirmar estrutura" had no server action: `ProjetoEditorial.status` remained `rascunho` after
>   the editor confirmed. Fix: advance status to `em_composicao` via the PROJ inbound port.
>
> These two endpoints complete the T04→T05 handoff.

### 8.1 Ignore / restore an unparsed segment

Persists an editorial annotation (`segmento_curadoria` row) recording that the editor chose to
ignore a specific unparsed segment. Does **not** mutate `manuscrito.estrutura` (manuscript is
immutable, local ADR-002). A GET on the manuscript / estrutura returns the full original tree;
the "ignored" overlay is a separate annotation set read by the FE on T04 hydration.

**Port:** `imp:write`

#### `POST /api/imp/manuscripts/{manuscritoId}/segmentos/{segmentoId}/ignore`

Mark a segment as ignored.

- `manuscritoId` — UUID of an existing manuscript in the active empresa.
- `segmentoId` — the `UnparsedSegment.id` from `ContentTree` (must exist in `manuscrito.estrutura`).
- **Success — `201 Created`**, body = `SegmentoCuradoriaDto` (§8.3).
- If already ignored: returns `200 OK` (idempotent — re-ignoring the same segment is harmless).

EARS:
- `WHEN an editor POSTs to ignore a known segmentoId of their manuscrito, THE SYSTEM SHALL persist
  a SegmentoCuradoria record and return 201.`
- `IF the segmentoId does not exist in manuscrito.estrutura, THEN THE SYSTEM SHALL respond 422
  (urn:cordele:imp:segmento-not-found).`
- `IF the manuscritoId does not exist in the active empresa, THEN THE SYSTEM SHALL respond 404.`
- `IF the segmentoId is already ignored, THE SYSTEM SHALL respond 200 (idempotent).`

#### `DELETE /api/imp/manuscripts/{manuscritoId}/segmentos/{segmentoId}/ignore`

Restore (un-ignore) a previously ignored segment.

- **Success — `204 No Content`**.
- If the segment was not ignored: `404` (there is nothing to delete).

EARS:
- `WHEN an editor DELETEs the ignore annotation for a known segmentoId, THE SYSTEM SHALL remove the
  SegmentoCuradoria record and return 204.`
- `IF no ignore annotation exists for the segmentoId, THEN THE SYSTEM SHALL respond 404.`

#### `GET /api/imp/manuscripts/{manuscritoId}/segmentos/ignored`

Returns the set of currently ignored `segmentoId` strings for the manuscript. Called on T04 hydration
alongside `GET /api/imp/manuscripts/{manuscritoId}/estrutura`.

- **Scope:** `imp:read`
- **Success — `200 OK`**, body = `{ "manuscritoId": "uuid", "ignoredSegmentoIds": ["u-1", "u-3"] }`

EARS:
- `WHEN a GET is made for the ignored set, THE SYSTEM SHALL return the current set of ignored segmentoIds
  for the manuscript, possibly empty.`

### 8.2 Confirm structure → advance projeto status

The editor's explicit confirmation that the structure review is complete. IMP validates the manuscript
and delegates the status advance to PROJ via in-process port — **IMP never writes `projeto_editorial`**
(decision D-C, §0).

**Port:** `imp:write`

#### `POST /api/imp/manuscripts/{manuscritoId}/confirm-estrutura`

Triggers the status transition `rascunho → em_composicao` on the owning `ProjetoEditorial`.

- **Request body:** empty (or `{}`).
- **Success — `200 OK`**, body = `ConfirmEstruturaResultDto` (§8.3).

Flow (application layer):
1. Resolve `manuscritoId` → `projeto_id` (must belong to active empresa).
2. Call `PROJ.AdvanceProjetoStatusUseCase.advanceTo(projetoId, targetStatus='em_composicao')`.
3. Return the result including the new `projetoStatus`.

EARS:
- `WHEN an editor POSTs confirm-estrutura for a valid manuscritoId, THE SYSTEM SHALL call
  PROJ.AdvanceProjetoStatusUseCase.advanceTo(projetoId, em_composicao) and return 200 with the
  new projeto status.`
- `IF the projeto is already in em_composicao (or a later status), THE SYSTEM SHALL respond 200
  without error (idempotent — re-confirming is harmless).`
- `IF the PROJ port fails or the projeto cannot be advanced, THE SYSTEM SHALL respond 422
  (urn:cordele:imp:status-advance-failed) and persist nothing.`
- `IF the manuscritoId does not exist in the active empresa, THE SYSTEM SHALL respond 404.`

**IMP↔PROJ agreement (binding):**
- IMP calls `PROJ.AdvanceProjetoStatusUseCase.advanceTo({ projetoId, targetStatus: 'em_composicao' })`.
- PROJ validates: `rascunho → em_composicao` is a legal transition; later statuses are accepted
  idempotently (no regression).
- IMP MUST NOT call this port more than once per confirm request; PROJ's use case is idempotent.
- The PROJ port stub is provided with the IMP scaffold; the real implementation lands with PROJ (M5+).

### 8.3 Schemas (Addendum)

#### `SegmentoCuradoriaDto`

```json
{
  "manuscritoId": "uuid",
  "segmentoId": "u-1",
  "acao": "ignorado",
  "criadoEm": "2026-08-24T14:31:46Z",
  "criadoPor": "principal-uuid"
}
```

#### `ConfirmEstruturaResultDto`

```json
{
  "manuscritoId": "uuid",
  "projetoId": "uuid",
  "projetoStatus": "em_composicao",
  "confirmedAt": "2026-08-24T14:31:46Z"
}
```

### 8.4 New errors

| `type` (URN) | HTTP | When |
|---|---|---|
| `urn:cordele:imp:segmento-not-found` | 422 | segmentoId absent from manuscrito.estrutura |
| `urn:cordele:imp:status-advance-failed` | 422 | PROJ port rejected the status advance |

---

## §9 — Endpoint interno de lote: sumário de manuscritos por projeto

### Path

`POST /api/imp/manuscripts/summaries`

> Full URL with global prefix: `POST /api/v1/imp/manuscripts/summaries`

### Autenticação e autorização

- **Auth:** Bearer JWT (global APP_GUARD).
- **Scope:** `imp:read` — leitura de dados de manuscrito.
- **Multi-empresa:** `empresaId` extraído de `@CurrentUser() user: AuthenticatedUser`; NUNCA hardcoded.

### Request body

```json
{ "projetoIds": ["uuid1", "uuid2", "..."] }
```

| Campo | Tipo | Restrições |
|---|---|---|
| `projetoIds` | `string[]` | UUIDs v4; máx **50** itens; obrigatório |

> **Limite de lote:** máximo 50 IDs por requisição (padrão cross-módulo). Enviar 51+ retorna
> `400 Bad Request` com `type: urn:cordele:imp:validation`. O consumidor (proj-service) deve
> fatiar listas maiores em blocos de até 50.

### Response — 200 OK

Array de itens (projetos sem manuscrito são **omitidos** — ausência no array significa "sem manuscrito", diferente de zeros):

```json
[
  { "projetoId": "uuid", "totalCapitulos": 12, "totalImagens": 34 }
]
```

| Campo | Tipo | Semântica |
|---|---|---|
| `projetoId` | `string` | ID do projeto |
| `totalCapitulos` | `number` | Campo persistido `total_capitulos` do manuscrito mais recente |
| `totalImagens` | `number` | Campo persistido `total_imagens` do manuscrito mais recente |

### Semântica de "mais recente"

Quando um projeto possui múltiplos manuscritos, o endpoint retorna os campos
`totalCapitulos` e `totalImagens` do manuscrito com maior `criadoEm` (desc).

### Query em lote

A consulta é feita com um único `findMany` com `projetoId: { in: projetoIds }`,
seguida de desduplicação em memória por `projetoId` (pick mais recente).
Garante N+1-free mesmo com centenas de projetos.

### Uso

Consumido pelo **proj-service** em
`infrastructure/proj/read/manuscript-summary.adapter.ts` para popular os campos
`totalCapitulos` e `totalImagens` nos cards da biblioteca de projetos.
