# IMP-INT-004 -- Schema-per-tenant Prisma client factory

**Status:** INTACT -- gerado 2026-08-24
**Maturidade:** 0 -- Inicial

## Contexto

The `manuscrito` and `segmento_curadoria` tables live in the tenant schema `emp_<slug>`. Prisma
targets one schema by default; this factory switches the search_path per request based on
`EmpresaContext` (AsyncLocalStorage populated by the middleware in IMP-017).

This is a shared monolith concern (not IMP-specific), but IMP scaffolds it first since it is the
first module with per-tenant tables.

## Spec de referencia
- SPEC-04 (data-model.md — tenancy convention)
- SPEC-06 (EmpresaContext RULE-07)

## Escopo

Files to create:

- `src/infrastructure/persistence/prisma-tenant.service.ts` — wraps PrismaClient, reads `EmpresaContext.get()`, calls `$executeRawUnsafe('SET search_path TO emp_${slug}, public')` before each repository call (or uses Prisma middleware `$use`)
- `src/infrastructure/persistence/prisma-tenant.service.spec.ts` — unit tests: verify schema switch per empresa slug

## Resultado esperado

All IMP repository calls execute in the correct tenant schema. Cross-tenant access is prevented
because `EmpresaContext` always comes from the JWT claim (IMP-017 ensures this).

## Criterios de aceite

- [x] `PrismaTenantService.getClient()` switches schema to `emp_${slug}` before returning client
- [x] Unit test verifies `SET search_path` called with slug from EmpresaContext
- [x] Calling without EmpresaContext populated throws `TenantContextException`
- [x] `pnpm test` exits 0

## Dependencias

- IMP-017 (precede — EmpresaContext middleware must populate the context before repository calls)

## Estimativa
M

## Prioridade
P3
