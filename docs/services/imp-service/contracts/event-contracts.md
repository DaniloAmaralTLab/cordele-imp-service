# Event Contracts — imp-service (Importação)

**Module:** IMP · **Transport:** in-process only (`stack.messaging.enabled = false`) — NestJS event
emitter; there is **no broker** in the POC. Events are best-effort, same-process notifications dispatched
**after commit**, never a cross-process delivery guarantee (doc 04, doc 02 §Cross-cutting).

**Governing docs:** doc 03 (Domain Events), `adr/ADR-002-manuscript-immutability-lossless-parse.md`.

---

## 1. Published events

### 1.1 `ManuscriptImported` (anchor event)

Raised **after** an immutable `Manuscrito` is successfully persisted and committed. Consumed within the
monolith (notably by PROJ, to advance `ProjetoEditorial.status` from `rascunho` toward `em_composicao`).

- **Name / channel:** `manuscript.imported` (in-process event name)
- **Timing:** after DB commit of the manuscrito row (post-commit hook), within the same request.
- **Payload:**

```json
{
  "eventId": "uuid",
  "occurredAt": "2026-08-24T14:31:46Z",
  "manuscritoId": "uuid",
  "projetoId": "uuid",
  "editoraId": "uuid",
  "formato": "docx",
  "totalCapitulos": 12,
  "totalImagens": 5,
  "trechosNaoParseados": 2
}
```

- **Headers / context:** `correlationId` (= `X-Correlation-Id`), `empresa` (tenant slug), `principalId`
  — carried via `EmpresaContext`, not in the payload body.

**EARS:**

- `WHEN a Manuscrito is committed, THE SYSTEM SHALL publish exactly one ManuscriptImported event carrying
  the manuscritoId, projetoId, editoraId and the three counts.`
- `IF the transaction rolls back, THEN THE SYSTEM SHALL NOT publish ManuscriptImported.`
- `THE SYSTEM SHALL publish counts identical to the persisted manuscrito row.`

### 1.2 `ManuscriptImportRejected`

Raised when an upload is rejected before a manuscript exists (unsupported format, oversize, or
irrecoverable parse failure). No manuscript is created.

- **Name / channel:** `manuscript.import-rejected`
- **Payload:**

```json
{
  "eventId": "uuid",
  "occurredAt": "2026-08-24T14:31:46Z",
  "projetoId": "uuid | null",
  "nomeArquivo": "livro.pdf",
  "reason": "unsupported_format"
}
```

- `reason ∈ {unsupported_format, file_too_large, parse_failed}`.
- `projetoId` is `null` when rejection happens before/without a project binding (create-and-upload where
  project creation itself was not reached).

**EARS:**

- `WHEN an upload is rejected for format, size or irrecoverable parse error, THE SYSTEM SHALL publish one
  ManuscriptImportRejected event and persist no manuscrito.`

---

## 2. Consumed events

**None in the IMP context.** Import is a source of events, not a subscriber, in the POC. (PROJ consumes
`ManuscriptImported`; that subscription is documented in the PROJ context, not here.)

---

## 3. Idempotency

- **No broker ⇒ no redelivery** in the POC: each event fires once, in-process, after commit. There is no
  at-least-once delivery to deduplicate against.
- Every event carries a unique `eventId`; consumers that later become out-of-process (post-POC broker)
  MUST treat `eventId` as the idempotency key with an at-least-once assumption.
- **Upload idempotency** (distinct from event idempotency): each upload creates a new manuscript
  (immutability). Optional content-hash dedupe is reserved (`data-model.md` §content_hash, `SPEC-05`),
  off in the MVP.

**EARS:**

- `WHERE a downstream consumer is moved out-of-process (post-POC), THE SYSTEM SHALL allow it to
  deduplicate by eventId under at-least-once delivery.`

---

## 4. Payload versioning

- Events are versioned by **additive evolution**: new optional fields only; no field is removed or
  retyped without a new event name (`manuscript.imported.v2`).
- Current version: `v1` (implicit). Consumers MUST ignore unknown fields.

**EARS:**

- `IF a new required datum is needed on an event, THEN THE SYSTEM SHALL introduce a new versioned event
  name rather than break the existing payload.`

---

## 5. Post-POC async note (decision D-B)

If the async parse path is enabled later, the surface stays event-compatible: parsing becomes a
background job that emits `ManuscriptImported` on completion (doc 04). The payload and event name do not
change; only the dispatch timing moves from "within the request" to "on job completion". The reserved
`status` values (`parsing`, `import_failed`) carry the interim state until the anchor event fires.
