# Event Catalog — imp-service (Importação)

Transport: **in-process** (NestJS event emitter; `messaging.enabled = false`). No broker. Full payloads
and EARS in `contracts/event-contracts.md`.

| Event | Type | Channel (in-process) | Payload | Known consumers |
|---|---|---|---|---|
| `ManuscriptImported` (anchor) | published | `manuscript.imported` | [event-contracts §1.1](../contracts/event-contracts.md) — `manuscritoId, projetoId, editoraId, formato, totalCapitulos, totalImagens, trechosNaoParseados` | **PROJ** (advances `ProjetoEditorial.status` `rascunho → em_composicao`) |
| `ManuscriptImportRejected` | published | `manuscript.import-rejected` | [event-contracts §1.2](../contracts/event-contracts.md) — `projetoId?, nomeArquivo, reason` | (none required in POC; available for audit/observability) |

**Consumed:** none — Import is a source of events, not a subscriber, in the POC.
