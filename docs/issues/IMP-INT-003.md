# IMP-INT-003 -- ManuscriptImported in-process event wiring + PROJ subscriber stub

**Status:** INTACT -- gerado 2026-08-24
**Maturidade:** 0 -- Inicial

## Contexto

`ManuscriptImported` is published in-process (IMP-006). PROJ is the intended consumer: it listens
to advance `ProjetoEditorial.status`. This issue wires the EventEmitter2 bus and creates the PROJ
subscriber stub inside the IMP module scope (pre-PROJ scaffold).

Note: `ConfirmEstruturaUseCase` (IMP-008) is the primary path for `rascunho → em_composicao`.
The event listener is a secondary / async-ready path — it provides an alternative signal if PROJ
later moves to an out-of-process broker.

## Spec de referencia
- SPEC-09 (event-contracts.md §1.1)

## Escopo

Files to create:

- `src/infrastructure/events/imp/manuscript-imported.listener.ts` — `@OnEvent('manuscript.imported')` stub that logs the event (real PROJ handler lands with PROJ module)
- `src/modules/imp/imp.module.ts` — register `EventEmitter2Module` import (modify IMP-001)

## Resultado esperado

EventEmitter2 bus registered in ImpModule. `ManuscriptImported` events are dispatched after commit.
The listener stub logs receipt without side-effects (PROJ handler replaces it).

## Criterios de aceite

- [x] `EventEmitter2Module.forRoot()` registered in ImpModule (or AppModule)
- [x] `@OnEvent('manuscript.imported')` listener registered and receives event after import
- [x] Listener log entry confirms `manuscritoId` and `projetoId` values
- [x] `pnpm test` does not fail due to unhandled event

## Dependencias

- IMP-006 (precede — events emitted)

## Estimativa
S

## Prioridade
P2
