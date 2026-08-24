<!-- OUTPUT-SCHEMA
- Status
- Contexto
- Decisão
- Consequências
-->

# ADR-001 — Import as a single bounded-context module

## Status
accepted (2026-08-24) · Scope: the Import (IMP) context of Cordelê

## Contexto
Import is one of four backend contexts (IMP, COMP, PUB, PROJ). At the project level the platform is a
modular monolith (shared ADR-002-modular-monolith) with one NestJS `@Module` per bounded context
(shared ADR-001-hexagonal-node). The open question for this context is whether Import should be
decomposed further — e.g. a separate "upload" service and a separate "parser" service, or an
independently deployed `imp-service` — or kept as one module.

Forces: the POC has a single team and no message broker (`messaging.enabled = false`), so an
independent deployment would add operational cost (its own process, its own tenant-schema wiring)
with no scaling need yet. The upload→store→parse→persist flow is one short synchronous transaction;
splitting it would introduce a network hop and eventual consistency where none is required. The
`imp-service` naming in the docs is a documentation convention, not a deployment mandate (ADR-002).

## Decisão
Import is a **single bounded-context NestJS module** (`imp`) inside the Cordelê modular monolith, not
decomposed and not independently deployed in the POC. Its only public surface is the exported inbound
port `ImportManuscriptUseCase` plus the in-process `ManuscriptImported` event. Upload validation,
file storage, parsing and persistence are internal collaborators of this one module, wired through
domain ports (`ManuscriptParserPort`, `ManuscriptRepositoryPort`, `FileStoragePort`). No other
context reads Import's tables or internal providers.

## Consequências
Positive: minimal moving parts; one transaction boundary; the whole import flow is testable in
process; downstream contexts couple only to a port and an event. Keeps the door open — because the
boundary is port-based — to extract a background parser service later without a domain change.

Negative / trade-offs: no independent scaling or deployment of parsing in the POC; a heavy parse runs
in the request lifecycle (mitigated by the 50 MB cap and streaming). If manuscript volume or size
grows, revisit and move parsing behind an async job (tracked as assumption A4 / risk R3 in doc 06);
that revision supersedes this ADR rather than editing it.
