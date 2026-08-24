<!-- OUTPUT-SCHEMA
- Stack
- Service Boundary
- Package Organization
- Hub Service Dependencies
- External Integrations
- Async vs Sync Decisions
-->

# 04 — Backend Architecture Direction

**Module:** IMP — Importação · **Service:** `imp-service` · **Package base:** `@cordele`

## Stack

- **Runtime:** Node.js 22
- **Framework:** NestJS 11.x (IoC container, injection tokens, `@Module` graph)
- **Language:** TypeScript (strict)
- **Package manager / build:** pnpm
- **ORM:** Prisma (typed client over PostgreSQL 16); migrations via `prisma migrate`
- **Persistence:** PostgreSQL 16 (schema-per-tenant)
- **Parsing libraries:** `mammoth` (DOCX → HTML/structure), `remark` (Markdown AST) — both wrapped
  behind a domain port, confined to infrastructure adapters
- **Messaging:** none (`stack.messaging.enabled = false`); in-process events only
- **AI:** none (deterministic conversion — framing §2.4)

There is no Java/Spring here (TECH-001). The only JVM dependency in the wider platform is epubcheck,
which belongs to the Publication context, not to Import.

## Service Boundary

Import is a single bounded-context module (`imp`) realized inside the Cordelê **modular monolith**
(ADR-002). It is not decomposed into finer services, and it is not independently deployed in the POC
(local ADR-001 service-boundary). Its public surface is the exported inbound port
`ImportManuscriptUseCase`; other contexts reach it through that port (or subscribe to
`ManuscriptImported`), never through its tables or internal providers (ADR-001 hexagonal-node §5).

The `imp-service` documentation directory is the home of this context; physically it is a NestJS
module within the single backend application.

## Package Organization

NestJS feature module + shared hexagonal layers (per `docs/architecture/backend/adr/ADR-001-hexagonal-node.md`):

```
src/modules/imp/                 imp.module.ts, imp.controller.ts, imp.service.ts (use case), dto/
src/domain/                      manuscrito.entity.ts, content-tree value objects,
                                 manuscrito.repository.interface.ts,
                                 manuscript-parser.port.ts, file-storage.port.ts
                                 (no @nestjs/*, no @prisma/client here)
src/infrastructure/              persistence/  (Prisma repository + mappers)
                                 parsing/      (docx-mammoth.adapter.ts, markdown-remark.adapter.ts)
                                 storage/      (local-disk.adapter.ts / s3.adapter.ts)
test/                            imp.e2e-spec.ts + jest-e2e.json
```

Dependency rule: `domain` imports nothing outward; `modules/imp` (application) depends on `domain`;
`infrastructure` implements domain ports and is wired in `ImpModule.providers` via `Symbol` tokens
(`{ provide: MANUSCRIPT_PARSER, useClass: ... }`). The parser adapter is selected per `formato`
behind `ManuscriptParserPort`, so the use case never names mammoth or remark directly.

## Hub Service Dependencies

None. Cordelê has no shared "hub" service and no TechLab AI dependency (`ai.hasAi = false`). Import
depends only on:

- **PostgreSQL** (via Prisma) for the `Manuscrito` aggregate.
- **File storage** (local disk POC / S3 prod) for the original binary and extracted images.

Cross-context relationships stay in-process: Import references `ProjetoEditorial`/`Editora` (owned by
PROJ) and announces `ManuscriptImported` for interested modules within the monolith.

## External Integrations

- **File Storage** — behind `FileStoragePort`; POC adapter writes to local disk (ADR-007 BA),
  production adapter targets S3-compatible object storage. Keys are tenant-scoped.
- **No third-party APIs, no broker, no AI provider** in the POC. Any future integration (e.g.
  malware scanning of uploads, cloud storage) enters as a new infrastructure adapter behind an
  existing or new port — no change to domain or application layers.

## Async vs Sync Decisions

- **Upload → parse → persist runs synchronously** within the request lifecycle. With no broker in
  the POC, there is nowhere to offload to, and the editor waits on Structure Review anyway. The
  50 MB cap plus streamed parsing keeps this bounded.
- **Domain events are dispatched in-process** (NestJS event emitter) after commit; they are
  best-effort, same-process notifications, not a delivery guarantee.
- **Future async path (post-POC):** should manuscripts grow or a broker be enabled, parsing becomes
  a background job emitting `ManuscriptImported` on completion. The port-based boundary makes this a
  swap of the application orchestration, not a domain change. Recorded as an assumption, not a
  commitment (doc 06).
