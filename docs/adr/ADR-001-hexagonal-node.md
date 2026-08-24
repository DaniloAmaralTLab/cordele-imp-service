# ADR-001 — Hexagonal Architecture on NestJS: the Module is the bounded context

- **Status:** accepted (YYYY-MM-DD)
- **Scope:** every Node.js service in `backend/services/` of Cordelê
- **Related decisions:** D-544 (NestJS, TypeScript strict, Node 22, pnpm), D-545 (Prisma + PostgreSQL)

## Context

Cordelê applies Ports & Adapters to its backend services. On the Java stack
the boundary is a package tree, and ArchUnit turns the layer rules into a compile-time gate. The
Node stack needs an equivalent that is just as enforceable, because the failure mode of a
TypeScript service without a structural boundary is well known: the ORM client gets injected
into a controller, a "service" grows into a 900-line file that talks HTTP, SQL and business
rules at once, and the domain becomes untestable without booting the framework.

NestJS offers three primitives that map onto the hexagon almost directly:

- an **IoC container** with explicit provider binding, which is what makes a port swappable;
- **injection tokens**, which compensate for TypeScript interfaces being erased at runtime;
- the **`@Module` decorator**, with an explicit `imports`/`providers`/`exports` graph.

The open question was what a `@Module` should represent. Three candidates were on the table:
a technical layer, a delivery feature, or a bounded context.

The second consideration is Prisma. Prisma has no repository abstraction and no entity
lifecycle — it generates a typed client over the schema. That is an advantage here: there is no
temptation to treat a Prisma model as a domain entity with behaviour, because it plainly is not
one. But it also means nothing stops the generated types from spreading across the codebase
unless a rule forbids it.

## Decision

**One NestJS `@Module` is one bounded context**, and it is the unit that owns aggregates,
persistence and transactions.

Concretely:

1. **Layers are directories, contexts are modules.** `src/domain/`, `src/modules/` (application)
   and `src/infrastructure/` are the three layers. Inside them, code is partitioned by bounded
   context, and the NestJS module for that context wires the three slices together.

2. **Ports are TypeScript interfaces declared in `src/domain/`.** Outbound ports (repository,
   publisher, external client) and inbound ports (use case) both live with the domain, because
   the domain owns the contract; infrastructure owns only the implementation.

3. **Every port has a `Symbol` DI token declared beside it.** Interfaces do not exist at
   runtime, so the token is the runtime identity of the port. `Symbol`, not a string, so two
   contexts cannot collide silently.

4. **Binding happens exclusively in the module's `providers` array.** `{ provide: TOKEN,
   useClass: Adapter }` is the single place where the hexagon is closed. Nothing else in the
   service names a concrete adapter.

5. **`exports` is the module's public API.** A module reaches another module through its
   exported inbound ports — never through an internal provider, and never through its tables.

6. **A transaction never spans two modules.** Cross-context consistency is eventual.

7. **`src/domain/` imports neither `@nestjs/*` nor `@prisma/client`**, enforced by scoped
   `no-restricted-imports` in `eslint.config.mjs`, run by the `eslintBoundaries` gate — the Node
   counterpart of ArchUnit RULE-01..09. `eslint-plugin-boundaries` is deliberately **not** used:
   adding a dependency so a gate can start is a worse trade than expressing the same constraint
   with what the service already declares (D-603).

8. **Prisma models are persistence models.** An explicit mapper sits between the Prisma row and
   the domain entity, and generated Prisma types never appear in a DTO, a controller signature
   or a port signature.

Bounded contexts of this project:

| Bounded context | NestJS module | Owns |
|---|---|---|
| `imp` —  | `ImpModule` | Its aggregates, its Prisma models, its migrations |
| `comp` —  | `CompModule` | Its aggregates, its Prisma models, its migrations |
| `pub` —  | `PubModule` | Its aggregates, its Prisma models, its migrations |
| `proj` —  | `ProjModule` | Its aggregates, its Prisma models, its migrations |

## Why "Module = bounded context" and not the alternatives

**Rejected: Module = technical layer** (`ControllersModule`, `ServicesModule`,
`RepositoriesModule`). This is how many NestJS codebases start, and it inverts the value of the
module system. Every provider becomes globally reachable, `exports` stops carrying information,
and the dependency graph says nothing about the domain. It also makes extraction into a separate
deployable a rewrite, because no module corresponds to a shippable unit of business capability.

**Rejected: Module = delivery feature / screen.** Feature modules track the roadmap, and the
roadmap changes far more often than the domain does. Two features touching the same aggregate
end up either duplicating the repository or sharing it through a third module that owns nothing
— which is how a shared "core" module accretes until it is the real application.

**Accepted: Module = bounded context.** The reasons:

- **It is the boundary that already exists.** A bounded context is defined by a consistent
  ubiquitous language and a set of invariants enforced together. That is exactly the set of
  objects that must commit together — so aligning the transaction boundary with the module
  boundary is not a convention, it is a restatement of the domain model.
- **`exports` becomes a real contract.** The published surface of a context is a short list of
  inbound ports, reviewable in one screen. Anything not exported is unreachable, which turns an
  architectural intention into a compile error.
- **It makes the module the unit of extraction.** If one context later needs its own scaling or
  release cadence, promoting it to a standalone service means moving a directory and replacing
  in-process port calls with HTTP. The internal structure does not move. This is
  the property that lets the project start as a modular monolith without paying for
  microservices it does not need yet.
- **It stops the shared-database anti-pattern early.** Because a module owns its Prisma models,
  a cross-context read is a visible port call rather than an invisible join — the coupling shows
  up in a code review instead of in a production incident.

**Rejected: no framework-free domain** ("just use `@Injectable()` everywhere"). Decorating
domain classes would make them cheap to wire and expensive to test: every domain unit test would
need `Test.createTestingModule`, which is roughly two orders of magnitude slower than `new`. The
domain layer stays constructible with `new`, and domain services are registered with
`useFactory` — the Node counterpart of the Java `DomainServiceConfig`.

**Rejected: repository interfaces in `infrastructure/`.** Putting the interface next to its
implementation reverses the dependency inversion the hexagon is built on: the domain would then
depend on infrastructure for its own contract.

## Consequences

**Positive**

- The domain layer is pure TypeScript: unit-testable in milliseconds, with no container boot.
- Swapping an adapter (Prisma → in-memory for tests, one HTTP client → another) is a one-line
  change in a `providers` array.
- Layer violations fail `pnpm lint` in CI, not at review time.
- Contexts can be extracted into separate services incrementally, without a rewrite.
- The Java and Node stacks of the framework share one mental model, so an architect moving
  between them reads the same structure under different syntax.

**Negative**

- More files per use case: a port, a token, an implementation, a mapper. This is the cost of the
  boundary; the generators absorb most of the typing.
- The `Symbol` token indirection is unusual for developers coming from plain Express, and a
  token/implementation mismatch fails at boot rather than at compile time. Mitigated by typed
  `Inject*` helper decorators declared beside each token.
- Two mappings (DTO ↔ domain ↔ Prisma row) look like duplication until the three shapes start
  diverging for independent reasons — which they always do.
- The lint configuration must exist per service; a missing `eslint.config.mjs` silently removes
  the gate — which is exactly what happened before D-603, when no service shipped one at all.
  `tests/smoke_multistack_generators.py` now scaffolds a real service and asserts the file is
  present and carries the `src/domain/` boundary rule (D-604).
**Multi-empresa note.** Node has no thread-local, so the
empresa context is carried by `AsyncLocalStorage`, opened once by a middleware
and required by every use case before it touches a repository. It does not cross a broker
boundary. Details in `../standards/node-hexagonal-patterns.md`.
## Implementation

- `../standards/node-hexagonal-patterns.md` — canonical layout, port/adapter/token patterns,
  the ESLint boundary rule set and the RULE-01..09 mapping.
- `../standards/node-conventions.md` — TypeScript strict flags, ESLint/Prettier, naming and
  import ordering.
- `../standards/node-testing-conventions.md` — how the boundary is exercised by the test pyramid.
- Post-scaffold gates for a Node service: `pnpm lint` → `tsc --noEmit` → `pnpm test:unit` →
  `pnpm test:integration`.

## References

- Alistair Cockburn, *Hexagonal Architecture (Ports and Adapters)*
- Eric Evans, *Domain-Driven Design* — bounded context
- [NestJS modules](https://docs.nestjs.com/modules) and [custom providers](https://docs.nestjs.com/fundamentals/custom-providers)
- `../standards/node-hexagonal-patterns.md`
- `../standards/services-catalog.md`
