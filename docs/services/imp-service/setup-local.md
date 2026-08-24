# Setup — Local (imp-service, Importação)

**Stack:** Node 22 · NestJS 11 · pnpm · Prisma + `prisma migrate` · PostgreSQL 16 · package base `@cordele`.
Import is a NestJS module (`imp`) inside the Cordelê modular monolith — it is not independently deployed
in the POC. Commands below drive the monolith backend and the `imp` module's tests.

## Dependencies

- **PostgreSQL 16** (schema-per-tenant: `cordele_global` + `emp_<slug>`, e.g. `emp_aetos`).
- **File storage:** local disk (POC) at a configured root; no S3 needed locally.
- **No broker, no TechLab AI, no service registry** (`messaging.enabled=false`,
  `serviceDiscovery.enabled=false`, `ai.hasAi=false`).
- **PROJ module** present in the monolith (IMP calls its inbound ports; stubs acceptable pre-PROJ — see
  `contracts/integration-contracts.md` §3).

## HTTP port

`imp-service` (as part of the monolith) serves under the BFF on **port 3000** (`PORT=3000`), base path
`/api/imp`. This is the port the Node scaffold reads.

## Environment variables

| Variable | Example | Notes |
|---|---|---|
| `PORT` | `3000` | monolith HTTP port |
| `DATABASE_URL` | `postgresql://cordele:cordele@localhost:5432/cordele?schema=cordele_global` | Prisma base connection; tenant schema targeted at runtime via `EmpresaContext` (RULE-07) |
| `IMP_MAX_UPLOAD_BYTES` | `52428800` | 50 MB cap (matches CHECK constraint) |
| `IMP_STORAGE_DRIVER` | `local` | `local` (POC) or `s3` (prod) |
| `IMP_STORAGE_LOCAL_ROOT` | `./.storage` | local-disk adapter root |
| `OAUTH2_JWK_SET_URI` | `http://localhost:8080/realms/cordele/protocol/openid-connect/certs` | JWT validation |

## Commands (Node stack)

```bash
pnpm install                         # install deps
pnpm prisma migrate dev              # apply migrations (manuscrito table + tenant provisioning)
pnpm --filter imp-service start:dev  # run the backend locally (watch mode)
pnpm test                            # run tests (imp unit + e2e)
```

> `pnpm --filter imp-service` targets the module's project in the pnpm/Nx workspace; if the monolith is
> a single app, use `pnpm start:dev` at the backend root. The BDD `.feature` files under `tests/cucumber/`
> are wired by `scripts/be-bdd-generator.py` in the scaffold phase.
