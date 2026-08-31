# ADR-003 — Multi-tenancy: schema-per-tenant with EmpresaContext propagation

- **Status:** accepted (2026-08-24)
- **Scope:** every backend module of Cordelê that persists or reads tenant data

## Context

Cordelê is B2B: the tenant is an `Editora` (publishing house), addressed in the ubiquitous language
as an *empresa*. Manuscripts are often unpublished creative work (framing §2.7) and fall under LGPD
(`compliance.lgpd = true`), so tenant isolation is a confidentiality requirement, not merely a
convenience. The platform is a modular monolith (ADR-002): one runtime serving potentially many
tenants, so isolation cannot rely on separate deployments.

The BA framing scoped the POC as single-tenant (ADR-005-poc-single-tenant), modelling `Editora` as a
"simplified tenant". The control plane, however, standardizes Cordelê on `multi-empresa` /
`schema-per-tenant` isolation. This record adopts the control-plane model so the isolation boundary is
correct from the first module rather than retrofitted; the single-tenant POC becomes the degenerate
case of one tenant schema.

## Decision

Cordelê uses **schema-per-tenant** isolation in PostgreSQL:

1. **`cordele_global`** holds shared, non-tenant data — the `Editora` (tenant) registry and platform
   users.
2. **`emp_<slug>`** (e.g. `emp_aetos`) holds each tenant's editorial data — projects, manuscripts,
   metadata, layout, publications.
3. The active tenant is carried by **`EmpresaContext`** (NestJS `AsyncLocalStorage`, **RULE-07**) for
   the whole request lifecycle. The persistence adapter targets the tenant schema from that context.
   The tenant is **never** taken from a caller-supplied field.
4. Tenant provisioning replays each module's DDL into the new `emp_<slug>` schema; migrations
   (`prisma migrate`) are applied to `cordele_global` and to every tenant schema.

## Alternatives considered

- **Single-tenant POC (BA ADR-005).** Rejected as the persistent model: correct isolation would have
  to be retrofitted, and manuscript confidentiality argues for real isolation from day one. Preserved
  as the one-tenant special case of this decision.
- **Row-level (discriminator column) multi-tenancy.** Rejected: a missing `WHERE tenant_id` leaks
  data across publishers; weaker guarantee for sensitive creative work.
- **Database-per-tenant.** Rejected for the POC: heavier to provision and operate than schema-per-
  tenant with no added benefit at this scale.

## Consequences

Positive: strong isolation by construction; a query in one tenant's context cannot reach another
tenant's rows; aligned with LGPD obligations; the single-tenant pilot is just one schema.

Negative / trade-offs: schema-per-tenant complicates migrations (every tenant schema must be
migrated) and requires runtime schema targeting on top of Prisma's single-schema assumption — a
shared platform mechanism to be built in the scaffold/infra phase. Connection and migration
fan-out grow with tenant count; acceptable for the POC and near-term.

## Resolution — Prisma tenant-targeting mechanism (D-619)

The negative trade-off above ("requires runtime schema targeting on top of Prisma's
single-schema assumption") is resolved: **a dynamic `PrismaClient` per tenant**, instantiated
on demand with a `datasourceUrl` pointing at `emp_<slug>` resolved from `EmpresaContext`, held
in a registry with LRU eviction. Prisma's `multiSchema` preview feature (`@@schema()` per model)
was rejected: it requires every tenant schema declared statically in `schema.prisma`, which
would force a `prisma generate` + redeploy on every new tenant onboarded — incompatible with the
runtime provisioning flow in point 4 above (Saga onboarding creates `emp_<slug>` on demand). See
`D-619` in the control-plane consolidation doc for full rationale.

## References

- `ADR-002-modular-monolith.md` — the shared runtime that makes isolation a data-layer concern.
- `project-context.json` → `multiTenancy` (mode `multi-empresa`, `globalSchema cordele_global`,
  `contextPropagation.rule RULE-07`).
- BA `ADR-005-poc-single-tenant` — superseded as the persistent tenancy model by this record.
- `D-619` (control-plane consolidation doc) — resolves the Prisma tenant-targeting mechanism.
