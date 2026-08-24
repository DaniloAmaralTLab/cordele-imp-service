# SPEC-05 — Idempotency & Concurrency

**Module:** IMP · **Refs:** `contracts/data-model.md` (§content_hash), `contracts/event-contracts.md` §3,
`adr/ADR-002-manuscript-immutability-lossless-parse.md`, doc 06 (idempotency gap).

## Objetivo

Definir o comportamento de re-submissão de upload e de concorrência, dado que manuscritos são imutáveis
e o parse é síncrono.

## Escopo

- **In:** idempotência de upload (novo manuscrito por upload; dedupe reservado); idempotência de evento;
  concorrência de uploads paralelos no mesmo projeto.
- **Out:** retries de broker (não há broker).

## Decisões técnicas

- **MVP:** cada upload cria um **novo** `Manuscrito` (imutabilidade — ADR-002). Sem dedupe.
- `content_hash` (SHA-256 do binário) é **computado e armazenado** para habilitar dedupe futuro sem
  breaking change; **não** enforça unicidade no MVP.
- Evento: `eventId` único; sob futuro broker, chave de idempotência at-least-once.

## Implementação

- Uploads concorrentes no mesmo projeto → múltiplos manuscritos válidos (histórico append-only); sem
  lock de projeto. A ordenação é por `criado_em`.
- Parse síncrono ⇒ sem estado intermediário compartilhado; nada a reconciliar entre requests.

## Casos de borda

- Mesmo arquivo enviado 2x → 2 manuscritos (MVP). Com dedupe ligado (futuro) → 2º retorna o existente.
- Cliente reenvia por timeout de rede após commit → cria duplicado (aceitável no MVP; mitigável por
  dedupe futuro ou por `Idempotency-Key` header — reservado, não no MVP).

## Critérios de aceite (EARS)

- `WHEN the same file is uploaded twice, THE SYSTEM SHALL create two distinct immutable manuscritos in
  the MVP (no in-place mutation).`
- `THE SYSTEM SHALL compute and store content_hash for every manuscrito.`
- `WHERE content-hash dedupe is enabled (post-POC), THE SYSTEM SHALL return the existing manuscrito
  instead of creating a duplicate.`
- `THE SYSTEM SHALL assign every published event a unique eventId.`
- `THE SYSTEM SHALL permit concurrent uploads to the same project without cross-request locking.`
