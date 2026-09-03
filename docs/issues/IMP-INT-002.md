# IMP-INT-002 -- PROJ AdvanceProjetoStatusUseCase port stub (confirm-estrutura addendum)

**Status:** INTACT -- gerado 2026-08-24
**Maturidade:** 0 -- Inicial

## Contexto

Addendum: `ConfirmEstruturaUseCase` (IMP-008) calls `PROJ.AdvanceProjetoStatusUseCase.advanceTo()`.
This issue provides the thin stub that lets IMP compile and unit tests run before PROJ exists.

The port interface `AdvanceProjetoStatusPort` is defined in IMP-008. This issue provides the
stub implementation and registers it in `ImpModule`.

**IMP↔PROJ agreement (from integration-contracts.md §5):**
- PROJ validates `rascunho → em_composicao` is legal; idempotent on later statuses.
- The real implementation lands with PROJ and replaces the stub via DI.

## Spec de referencia
- integration-contracts.md §5 (addendum)
- api-contract.md §8.2 (addendum)

## Escopo

Files to create:

- `src/infrastructure/stubs/imp/advance-projeto-status.stub.ts` — stub: always returns `{ projetoId, newStatus: 'em_composicao' }`
- `src/modules/imp/imp.module.ts` — register stub under token `ADVANCE_PROJETO_STATUS_PORT` (modify IMP-001)

## Resultado esperado

`pnpm build` exits 0. `ConfirmEstruturaUseCase` unit tests can inject the stub and mock its behaviour.

## Criterios de aceite

- [x] `ADVANCE_PROJETO_STATUS_PORT` DI token registered in ImpModule
- [x] Stub returns `{ projetoId, newStatus: 'em_composicao' }` — always succeeds (dev scaffold mode)
- [x] `pnpm build` exits 0
- [x] Unit test for ConfirmEstruturaUseCase can override the stub via `overrideProvider`

## Dependencias

- IMP-001 (precede)
- IMP-008 (precede — port interface defined there)

## Estimativa
S

## Prioridade
P2
