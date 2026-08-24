# ADR-002 — Modular Monolith: one deployable, many bounded contexts

- **Status:** accepted (2026-08-24)
- **Scope:** the entire Cordelê backend (contexts IMP, COMP, PUB, PROJ)

## Context

Cordelê is a POC for a single pilot tenant (Editora Aetós) built by one team, with no message broker
(`messaging.enabled = false`) and no service discovery or API gateway. The domain decomposes cleanly
into four bounded contexts — Import, Composition, Publication, Projects — and the documentation is
organized as one directory per "service" (`imp-service`, `comp-service`, …). The question is whether
those four contexts should be four independently deployed services or one deployable.

Forces: the flows are short and mostly synchronous (upload→parse, configure→preview,
build→validate→download); cross-context consistency needs are modest; there is no scaling pressure in
the POC; and without a broker, splitting into services would force synchronous HTTP coupling and
distributed transactions where none are warranted. Premature microservices would multiply operational
cost (processes, per-schema wiring, deployment) for no benefit.

## Decision

The Cordelê backend is a **modular monolith**: one deployable NestJS application in which **each
bounded context is one NestJS `@Module`** (per ADR-001-hexagonal-node). Modules communicate through
exported inbound ports and in-process domain events, never through each other's tables or internal
providers. A transaction never spans two modules; cross-context consistency is eventual. The
`*-service` documentation directories name contexts, not deployment units.

## Alternatives considered

- **Microservices per context (one deployable each).** Rejected for the POC: adds process,
  deployment and tenant-schema-wiring overhead, and — with no broker — forces synchronous inter-
  service coupling and distributed transactions. Kept as a future option; the port-based boundaries
  make extraction possible without a domain rewrite.
- **Layered monolith without context modules.** Rejected: loses the bounded-context boundary and
  invites the "everything imports everything" failure mode the hexagonal ADR exists to prevent.

## Consequences

Positive: one process to run and deploy; in-process, transactionally simple flows; strong context
boundaries preserved by the module graph; straightforward local testing. The architecture can grow
into services later, context by context, because each is already an isolated module behind ports.

Negative / trade-offs: all contexts share a runtime and are deployed together, so one context cannot
scale or fail independently; discipline (enforced by scoped `no-restricted-imports` in `eslint.config.mjs`, ADR-001 rule 7) is required
to keep modules from reaching past their ports. Revisited if load or team topology demands it — a move
to services would supersede this record rather than edit it.

## References

- `ADR-001-hexagonal-node.md` — one `@Module` is one bounded context.
- `ADR-003-multi-tenancy.md` — schema-per-tenant, shared across all modules of the monolith.
