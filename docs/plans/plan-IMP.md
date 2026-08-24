# Plano -- IMP (imp-service, Importação)

## Status das prioridades

- P1 -- pendente
- P2 -- pendente
- P3 -- pendente
- P4 -- pendente
- P5 -- pendente
- P7 -- pendente
- P8 -- pendente
- P9 -- pendente

---

## 0. Leitura executiva

### Papel do serviço

`imp-service` is the **Import** module of the Cordelê modular monolith: it parses uploaded
DOCX/Markdown manuscripts into a canonical `ContentTree` (chapters → sections → blocks),
persists the immutable `Manuscrito` aggregate, and emits `ManuscriptImported`. It owns the
first phase of the editorial pipeline (Upload → Structure Review) and gates entry into
Composition (COMP).

Key architectural constraints:
- Parse is **synchronous** in the request cycle (decision D-A): upload returns `201 Created`
  with the full `ManuscritoDetail` (no async job, no polling).
- Manuscripts are **immutable** after insert (local ADR-002): re-upload creates a new row.
- `ProjetoEditorial` is **owned by PROJ** (decision D-C): IMP calls PROJ inbound ports, never
  writes the `projeto_editorial` table.
- Two addendum endpoints added in M4: "Ignorar fragmento" (persist editorial annotation) and
  "Confirmar estrutura" (advance projeto status via PROJ port).

### MVP scope

Upload DOCX/Markdown → parse → persist Manuscrito → return ManuscritoDetail (201).
Structure Review hydration (GET manuscript + GET estrutura). Import history (GET by project).
T04 editorial annotations: ignore segment (POST/DELETE) + confirm estrutura (POST).

### Diagnóstico inicial (gaps mapeados em doc 06)

- **A1 (schema-per-tenant provisioning):** shared platform concern; IMP scaffolds `PrismaTenantService` first. P3.
- **A2 (parser determinism):** covered by SPEC-03; style map must be explicit. P4.
- **A3 (JSONB vs relational tree):** kept as JSONB in POC; no impact on this plan.
- **A4 (sync parse):** resolved by D-A; no polling endpoints exist.
- **M4 addendum:** two new endpoints (§8 api-contract.md) and one new table (`segmento_curadoria`).

---

## 1. Estratégia geral

### Objetivo macro

Deliver a compilable, testable NestJS `ImpModule` with full import orchestration, both parse
adapters, schema-per-tenant persistence, JWT security, and BDD coverage — in 9 priorities
that the `be-implement` agent can execute one at a time.

### Ordem das prioridades

| P | Título | Motivo |
|---|---|---|
| P1 | Scaffold + API surface | Module must compile before use cases can be implemented |
| P2 | Orchestration (use cases + addendum) | Golden path + PROJ stubs + events — full application layer |
| P3 | Persistence + migrations | Prisma models + schema-per-tenant factory |
| P4 | Parse adapters + FileStorage | The `ManuscriptParserPort` implementations (mammoth + remark) |
| P5 | Security | JWT guard + EmpresaContext — blocks integration testing without it |
| P7 | Observability | Correlation ID + health — operational readiness |
| P8 | BDD end-to-end | Cucumber scenarios over the full stack |
| P9 | Hardening | S3 adapter for production storage |

---

## 2. Plano por prioridade

### Prioridade 1 -- Scaffold + API surface

Status: pendente

#### Objetivo / Resultado esperado

`pnpm build` exits 0. ImpModule registered in AppModule. ImpController declares all 7 routes
with stub responses. All DI tokens declared.

#### Issues vinculadas

- IMP-001 — NestJS ImpModule + ImpController (7 routes)
- IMP-002 — DTOs + validation pipes
- IMP-003 — Domain aggregate Manuscrito + ContentTree / Block value objects

#### Specs cobertas

- SPEC-01 (api-contract.md §4 + §8)

#### Sequencia de execucao

- Fase 1: IMP-003 (domain types — no dependencies)
- Fase 2: IMP-002 (DTOs import domain types)
- Fase 3: IMP-001 (controller imports DTOs; registers DI tokens)

#### Criterios de aceite

- `pnpm build` exits 0
- All 7 routes visible in NestJS route listing
- All DI tokens declared

#### Riscos

Low: this is pure scaffold with no business logic.

#### Instrucao para implementador

Create the directory structure `src/modules/imp/`, `src/domain/imp/`, `src/domain/imp/ports/` first.
Use `pnpm add @nestjs/swagger` if not already in the monolith. Register `ImpModule` in `AppModule`.

---

### Prioridade 2 -- Orchestration (use cases + addendum + stubs)

Status: pendente

#### Objetivo / Resultado esperado

`ImportManuscriptUseCase`, `IgnoreSegmentUseCase`, `ConfirmEstruturaUseCase` implemented and
unit-tested. PROJ port stubs registered. EventEmitter2 bus wired. All use-case unit tests pass.

#### Issues vinculadas

- IMP-004 — ImportManuscriptUseCase
- IMP-005 — Project binding D-C
- IMP-006 — ManuscriptImported + ManuscriptImportRejected events
- IMP-007 — IgnoreSegmentUseCase (addendum)
- IMP-008 — ConfirmEstruturaUseCase (addendum)
- IMP-INT-001 — PROJ port stubs (CreateProjetoEditorialUseCase + Lookup)
- IMP-INT-002 — AdvanceProjetoStatusUseCase stub (addendum)
- IMP-INT-003 — EventEmitter2 wiring + PROJ listener stub

#### Specs cobertas

- SPEC-02, SPEC-09, SPEC-10, api-contract.md §8 (addendum)

#### Sequencia de execucao

- Fase 1: IMP-INT-001 + IMP-INT-002 (stubs first — use cases depend on DI tokens)
- Fase 2: IMP-INT-003 (EventEmitter2 bus)
- Fase 3: IMP-004 + IMP-005 + IMP-006 (main import use case)
- Fase 4: IMP-007 + IMP-008 (addendum use cases)

#### Criterios de aceite

- `pnpm test src/modules/imp/use-cases/` exits 0 (all branches)
- ImportManuscriptUseCase: happy path, rejection, unparsed segments
- IgnoreSegmentUseCase: ignore, idempotent ignore, restore, invalid segmentoId
- ConfirmEstruturaUseCase: success, idempotent, PROJ failure → 422
- No adapter imported in any use case file

#### Riscos

Medium: `IgnoreSegmentUseCase` validates `segmentoId` against JSONB — this requires loading the
`manuscrito.estrutura` from the repository before persisting. At unit test level, mock the
repository to return a controlled estrutura.

#### Instrucao para implementador

Implement all use cases using only port interfaces. Use `class-validator` in DTOs but keep
domain entities as plain TypeScript. The `resolve-project-binding.ts` helper is shared by
`ImportManuscriptUseCase` and should be extracted as a separate file tested independently.

---

### Prioridade 3 -- Persistence + migrations

Status: pendente

#### Objetivo / Resultado esperado

Prisma models for `Manuscrito` and `SegmentoCuradoria` in `schema.prisma`. Two migrations.
`ManuscritoRepository` + `SegmentoCuradoriaRepository` Prisma adapters. Schema-per-tenant factory.

#### Issues vinculadas

- IMP-009 — Prisma schema + migration V0001
- IMP-010 — ManuscritoRepository Prisma adapter
- IMP-011 — SegmentoCuradoria Prisma model + migration V0002 + repository
- IMP-INT-004 — Schema-per-tenant Prisma client factory

#### Specs cobertas

- SPEC-04

#### Sequencia de execucao

- Fase 1: IMP-INT-004 (schema-per-tenant factory — other repos depend on it)
- Fase 2: IMP-009 (Prisma schema + V0001 migration)
- Fase 3: IMP-010 (ManuscritoRepository)
- Fase 4: IMP-011 (SegmentoCuradoria model + V0002 + repository)

#### Criterios de aceite

- `pnpm prisma validate` exits 0
- `ManuscritoRepository.save()` never calls update/upsert on manuscrito
- Schema-per-tenant factory switches to `emp_${slug}` per call

#### Riscos

Medium: schema-per-tenant Prisma wiring (IMP-INT-004) requires `$executeRawUnsafe` or Prisma
middleware — test carefully that the switch is atomic per request.

#### Instrucao para implementador

Start with IMP-INT-004 factory so that repository adapters can be tested against it.
Run `pnpm prisma migrate dev` on a local PostgreSQL with `emp_aetos` schema already provisioned.

---

### Prioridade 4 -- Parse adapters + FileStorage

Status: pendente

#### Objetivo / Resultado esperado

DOCX (mammoth) and Markdown (remark) adapters implemented and tested with fixtures. All 7
UnparsedSegment reasons detected. FileStoragePort local-disk adapter operational.

#### Issues vinculadas

- IMP-012 — ManuscriptParserPort interface + factory
- IMP-013 — DOCX mammoth adapter
- IMP-014 — Markdown remark adapter
- IMP-015 — UnparsedSegment detection (7 reasons)
- IMP-016 — FileStoragePort local-disk adapter

#### Specs cobertas

- SPEC-03, SPEC-10

#### Sequencia de execucao

- Fase 1: IMP-012 (port interface + factory)
- Fase 2: IMP-016 (FileStorage — needed by DOCX adapter for image extraction)
- Fase 3: IMP-013 (DOCX adapter)
- Fase 4: IMP-014 (Markdown adapter)
- Fase 5: IMP-015 (UnparsedSegment coverage across both adapters)

#### Criterios de aceite

- `livro-3-capitulos.docx` → 3 chapters, 2 images, 0 unparsed
- `livro-com-tabela-complexa.docx` → 1 unparsed (complex_table)
- All 7 reason types have at least one test
- Determinism: same input → same tree (tested explicitly)

#### Riscos

High: DOCX parsing with mammoth requires building a working style map. Invest in the style
map first; add reasons one by one. `livro-corrompido.docx` must cause mammoth to throw for
the 422 scenario.

#### Instrucao para implementador

Run `pnpm add mammoth remark remark-parse unified`. Build the style map from the heading
hierarchy H1=chapter, H2=section. Tables not in the style map → `complex_table`. Apply IMP-021
fixtures before running parser tests.

---

### Prioridade 5 -- Security

Status: pendente

#### Objetivo / Resultado esperado

JWT guard + scope enforcement + EmpresaContext middleware applied globally to ImpController.
Cross-tenant access → 404. Missing token → 401. Wrong scope → 403.

#### Issues vinculadas

- IMP-017 — OAuth2 JWT guard + scope enforcement + EmpresaContext middleware

#### Specs cobertas

- SPEC-06

#### Sequencia de execucao

- Fase única: IMP-017

#### Criterios de aceite

- All 7 routes protected (verified by e2e test without token → 401)
- `EmpresaContext` populated from JWT before any use case executes
- `pnpm test` exits 0

#### Instrucao para implementador

Use `passport-jwt` + `jwks-rsa` for JWT validation. The JWK Set URI is `OAUTH2_JWK_SET_URI`.
In tests, use a self-signed key pair and mock the JWK endpoint.

---

### Prioridade 7 -- Observability + health

Status: pendente

#### Issues vinculadas

- IMP-018 — X-Correlation-Id interceptor + structured logger
- IMP-019 — Health/readiness endpoint

#### Specs cobertas

- SPEC-07

#### Sequencia de execucao

- Fase 1: IMP-018 (interceptor — applies globally, no other dependencies)
- Fase 2: IMP-019 (health endpoint — depends on PrismaService and FileStoragePort being available)

---

### Prioridade 8 -- BDD end-to-end

Status: pendente

#### Issues vinculadas

- IMP-021 — Test seed fixtures (6 files)
- IMP-020 — Cucumber JS step definitions

#### Specs cobertas

- SPEC-08

#### Sequencia de execucao

- Fase 1: IMP-021 (fixtures — seed script + all 6 files)
- Fase 2: IMP-020 (step definitions + runner config)

#### Criterios de aceite

- `pnpm test:bdd` exits 0 with all scenarios passing
- `livro-corrompido.docx` fixture present and triggers 422

#### Instrucao para implementador

Run `pnpm add -D @cucumber/cucumber` if not already in the monolith. Write the seed script
`scripts/seed-imp-fixtures.ts` that generates the fixtures programmatically (use `docx` npm
package for DOCX generation). The corrupt DOCX can be a truncated zip: write 100 random bytes
with a `.docx` extension.

---

### Prioridade 9 -- Hardening

Status: pendente

#### Issues vinculadas

- IMP-INT-005 — FileStoragePort S3-compatible adapter

#### Specs cobertas

- SPEC-10 (integration-contracts.md §1)

---

## 3. Dependências externas

| Dependência | Tipo | Impacto em IMP |
|---|---|---|
| PROJ module | In-process NestJS module | IMP-INT-001, IMP-INT-002: stubs required pre-PROJ |
| PostgreSQL 16 | Database | Tenant schemas `emp_aetos` must exist before integration tests |
| mammoth npm | Parser library | P4 (DOCX adapter) |
| remark npm | Parser library | P4 (Markdown adapter) |
| OAUTH2_JWK_SET_URI | External auth endpoint | P5 (JWT validation); mocked in tests |

---

## 4. Restrições arquiteturais (node)

- Scoped `no-restricted-imports` in `eslint.config.mjs` (gate `eslintBoundaries`) enforces layer boundaries: `modules/` imports only from `domain/`; `infrastructure/` imports from `domain/` only; no cross-layer upward imports.
- Prisma transactions only in the application layer (`ImportManuscriptUseCase`); repositories are stateless adapters.
- `EmpresaContext` (AsyncLocalStorage) populated by middleware before the request reaches any use case; never read from URL path.
- Manuscripts: INSERT only (no UPDATE) — enforced in `ManuscritoRepository` (the Prisma `update` method is deliberately not called).
- IMP NEVER imports `projeto_editorial` Prisma model or writes to it directly.

---

## 5. Referências

- `docs/architecture/backend/services/imp-service/contracts/api-contract.md` (§4 + §8 addendum)
- `docs/architecture/backend/services/imp-service/contracts/data-model.md` (§2.1 + §8 addendum)
- `docs/architecture/backend/services/imp-service/contracts/event-contracts.md`
- `docs/architecture/backend/services/imp-service/contracts/integration-contracts.md` (§3 + §5 addendum)
- `docs/architecture/backend/services/imp-service/spec/backend/SPEC-01..SPEC-10`
- `docs/architecture/backend/adr/ADR-001-hexagonal-node.md`
- `docs/architecture/backend/adr/ADR-002-modular-monolith.md`
- `docs/architecture/backend/adr/ADR-003-multi-tenancy.md`
- `docs/architecture/backend/services/imp-service/adr/ADR-002-manuscript-immutability-lossless-parse.md`
