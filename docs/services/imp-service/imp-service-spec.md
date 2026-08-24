---
service: imp-service
module: IMP
displayName: Importação
stack: node/nestjs/prisma/postgres
phase: specs
authoritative_decisions:
  - "D-A: parse is synchronous in the request (BE overrides FE ADR-IMP-001 polling)"
  - "D-B: Manuscrito.status modelled to keep async path open post-POC"
  - "D-C: ProjetoEditorial owned by PROJ; upload sends projetoTitulo (create via PROJ port) OR projetoId"
---

# imp-service — Specs (entry point)

**Module:** IMP — Importação · **Service:** `imp-service` · **Stack:** Node 22 · NestJS 11 · Prisma ·
PostgreSQL 16 · `@cordele`. Bounded context inside the Cordelê modular monolith (ADR-002).

Import turns an uploaded DOCX/Markdown manuscript into an immutable, structured `Manuscrito` (content
tree) without ever altering author content, and announces `ManuscriptImported`. This document maps the
contracts, specs, tests and diagrams produced by the Specs phase. Specs are implementable without
re-reading the Vision; every spec references an ADR.

## Authoritative decisions (resolved this phase)

- **D-A — Synchronous parse.** `POST /api/imp/manuscripts` parses in-request and returns the parsed
  `Manuscrito` (content tree included). No `parseJobId`, no `202`, no polling. **The BE overrides FE
  `ADR-IMP-001`; M3 must rewrite/downgrade it.** See `contracts/api-contract.md` §0/§4.1.
- **D-B — `status` modelled anyway.** `Manuscrito.status` (`imported|parsing|import_failed`) keeps the
  post-POC async path open without a breaking change; MVP always writes `imported`.
- **D-C — `ProjetoEditorial` ownership.** Owned by PROJ. Upload sends `projetoTitulo` (IMP creates via
  the PROJ inbound port, in-process) **or** `projetoId` (existing). Never both, never neither. See
  `contracts/integration-contracts.md` §3.

## Map

| Area | File |
|---|---|
| API surface | `contracts/api-contract.md` (incl. §6.2 ContentTree, §6.3 unparsed taxonomy) |
| Data model | `contracts/data-model.md` (canonical `sql` — `manuscrito`) |
| Events | `contracts/event-contracts.md`, `events/event-catalog.md` |
| Hub / TechLab AI | `contracts/hub-integration.md` (N/A) |
| Integrations | `contracts/integration-contracts.md` (storage, parsers, PROJ port) |
| Specs | `spec/backend/SPEC-01..10.md` |
| BDD | `tests/cucumber/*.feature` + `spec/backend/SPEC-08-bdd-test-scenarios.md` |
| Diagrams | `diagrams/c4-{context,container,component}.puml` |
| Local setup | `setup-local.md` |

## ADRs referenced

- Shared: `docs/architecture/backend/adr/ADR-001-hexagonal-node.md`, `ADR-002-modular-monolith.md`,
  `ADR-003-multi-tenancy.md`.
- Local: `adr/ADR-001-service-boundary.md`, `adr/ADR-002-manuscript-immutability-lossless-parse.md`.

## Next

→ `/be-architect-backlog cordele IMP`
