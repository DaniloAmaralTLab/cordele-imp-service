# SPEC-09 — Messaging Architecture

**Module:** IMP · **Refs:** `contracts/event-contracts.md`, doc 04 §Async vs Sync, doc 02 §Cross-cutting.

## Objetivo

Especificar a arquitetura de mensageria do IMP — que, no POC, é **in-process apenas** (`messaging.enabled
= false`; sem broker).

## Escopo

- **In:** despacho in-process de `ManuscriptImported` / `ManuscriptImportRejected` após commit;
  semântica best-effort; caminho async futuro (D-B).
- **Out:** broker, tópicos, partições, DLQ (não existem no POC).

## Decisões técnicas

- NestJS event emitter; publish **pós-commit**; entrega best-effort mesmo-processo (não é garantia).
- Sem consumo de eventos no IMP (é fonte). PROJ consome `ManuscriptImported` in-process.
- **Futuro async (D-B):** parse vira job de background que emite `ManuscriptImported` na conclusão; nome
  e payload do evento **não mudam**; `status` reservado (`parsing`) cobre o interim.

## Implementação

- Publicação atada ao commit da TX (hook pós-commit). Rollback ⇒ nenhum evento.
- `eventId` único por evento; consumidores out-of-process futuros deduplicam por `eventId`.

## Casos de borda

- Consumidor in-process lança exceção → não afeta o resultado do import (best-effort); logado.
- Habilitar broker no futuro → mesma superfície de evento, troca de transporte, sem breaking change.

## Critérios de aceite (EARS)

- `WHEN a manuscrito is committed, THE SYSTEM SHALL dispatch ManuscriptImported in-process exactly once.`
- `IF the transaction rolls back, THEN THE SYSTEM SHALL dispatch no domain event.`
- `THE SYSTEM SHALL treat in-process dispatch as best-effort and not depend on it for cross-process
  delivery in the POC.`
- `WHERE the async path is enabled (post-POC), THE SYSTEM SHALL keep the ManuscriptImported name and
  payload unchanged.`
