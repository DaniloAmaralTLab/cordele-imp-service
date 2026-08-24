# IMP-INT-001 -- PROJ inbound port stubs (CreateProjetoEditorialUseCase + ProjetoEditorialLookup)

**Status:** INTACT -- gerado 2026-08-24
**Maturidade:** 0 -- Inicial

## Contexto

IMP depends on two PROJ inbound ports for project binding (D-C). Since PROJ is scaffolded after
IMP, we need **thin stubs** so IMP compiles and use-case tests can run without the real PROJ module.

The stubs are registered as NestJS providers behind DI tokens `CREATE_PROJETO_USE_CASE` and
`PROJETO_EDITORIAL_LOOKUP`. Integration tests override them with mocks. The real implementations
land when PROJ (M5+) is scaffolded.

## Spec de referencia
- SPEC-10 (integration-contracts.md §3)

## Escopo

Files to create:

- `src/domain/imp/ports/create-projeto-editorial.port.ts` — interface `create({ titulo: string }): Promise<{ projetoId: string }>`
- `src/domain/imp/ports/projeto-editorial-lookup.port.ts` — interface `exists(projetoId: string, empresaSlug: string): Promise<boolean>`
- `src/infrastructure/stubs/imp/create-projeto-editorial.stub.ts` — stub implementation: always returns `{ projetoId: uuid() }` (for development pre-PROJ)
- `src/infrastructure/stubs/imp/projeto-editorial-lookup.stub.ts` — stub: always returns `true`
- `src/modules/imp/imp.module.ts` — register stubs under DI tokens (modify IMP-001 deliverable, with env-flag switch to real impl when PROJ lands)

## Resultado esperado

`pnpm build` exits 0 with stubs registered. Use-case unit tests can inject mock implementations.

## Criterios de aceite

- [ ] DI tokens `CREATE_PROJETO_USE_CASE` and `PROJETO_EDITORIAL_LOOKUP` registered in ImpModule
- [ ] Stubs implement the port interfaces (TypeScript compiles)
- [ ] Integration test can override stubs via `overrideProvider` in NestJS testing module
- [ ] `pnpm build` exits 0

## Dependencias

- IMP-001 (precede — ImpModule must exist)
- IMP-003 (precede — port interfaces)

## Estimativa
S

## Prioridade
P2
