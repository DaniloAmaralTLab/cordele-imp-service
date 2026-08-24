# Node Hexagonal Patterns (Cordelê Backend)

> Ports & Adapters on NestJS: **one NestJS Module = one bounded context**, plus EmpresaContext propagation.

## Purpose

Prescriptive guide for applying Hexagonal Architecture to every Node.js service under
`backend/services/`. It delivers the same guarantees as the Java variant — separation of
concerns, testability, operational predictability — expressed with NestJS primitives.

## Scope

- Backend engineers, code reviewers and automation agents working on any Node service.
- Node.js 22 / NestJS / TypeScript strict / pnpm / Prisma (D-544, D-545).
- Conventions (naming, imports, DI style) live in `node-conventions.md`.

---

## 1. NestJS Module = bounded context

A NestJS `@Module` is not a folder grouping — it is the **transactional and conceptual
boundary of one bounded context**. The rationale is recorded in
`../adr/ADR-001-hexagonal-node.md`.

The consequences are binding:

| Property | Rule |
|---|---|
| Ownership | One module owns its aggregates, its Prisma models, and its migrations |
| Surface | Everything a module exposes is declared in its `exports` array — nothing else is reachable |
| Coupling | A module never imports another module's internal provider; it imports the other module (or calls it over HTTP) |
| Persistence | A module never queries another module's tables; cross-context reads go through the owner's port |
| Transactions | A transaction never spans two modules. Cross-context consistency is eventual |

Module map for this project:

| Module (bounded context) | NestJS module class | Root path |
|---|---|---|
| `imp` —  | `ImpModule` | `src/modules/imp/` |
| `comp` —  | `CompModule` | `src/modules/comp/` |
| `pub` —  | `PubModule` | `src/modules/pub/` |
| `proj` —  | `ProjModule` | `src/modules/proj/` |

`AppModule` is a composition root only: it wires `ConfigModule`, `PrismaModule`,
observability, and the feature modules. It contains no business logic and no controller.

---

## 2. Canonical directory layout

Every service uses the following layout under `src/`:

```
src/
├── main.ts                     # bootstrap: ValidationPipe, Swagger, filters, shutdown hooks
├── app.module.ts               # composition root — imports feature modules only
├── modules/<context>/          # ONE bounded context (application layer)
│   ├── <context>.module.ts     # @Module — providers, controllers, exports, DI bindings
│   ├── <context>.controller.ts # @Controller — HTTP entry point (driving adapter)
│   ├── <context>.service.ts    # application service — use case orchestration
│   ├── dto/                    # request/response DTOs (class-validator)
│   └── <context>.tokens.ts     # re-export of the DI tokens the module binds
├── domain/<context>/           # PURE — no @nestjs/*, no @prisma/client, no decorators
│   ├── <aggregate>.entity.ts   # entity / aggregate root with behaviour
│   ├── <aggregate>.vo.ts       # value objects
│   ├── <aggregate>.repository.interface.ts   # OUTBOUND port
│   ├── <use-case>.port.ts      # INBOUND port (use-case interface)
│   ├── <context>.domain-service.ts           # cross-entity domain rules
│   ├── <context>.tokens.ts     # InjectionToken constants for the ports above
│   └── exception/              # DomainError subclasses
└── infrastructure/             # driven adapters — the only layer that knows the outside world
    ├── prisma/
    │   ├── prisma.module.ts
    │   └── prisma.service.ts   # extends PrismaClient, onModuleInit/onModuleDestroy
    ├── persistence/<context>/
    │   ├── prisma-<aggregate>.repository.ts  # implements the outbound port
    │   └── <aggregate>.mapper.ts             # domain <-> Prisma row
    ├── http/                   # outbound HTTP clients (anti-corruption layer)
    └── auth/                   # JwtStrategy, guards, EmpresaContextMiddleware
```

**Layer dependency rules:**

| Layer | May depend on | Forbidden |
|---|---|---|
| `domain` | Other `domain` files, `node:` built-ins | `@nestjs/*`, `@prisma/client`, `infrastructure`, `modules` |
| `modules` (application) | `domain` (entities, ports, tokens), `@nestjs/common` for DI | `infrastructure`, `@prisma/client` |
| `infrastructure` | `domain` (ports, entities), external libraries | `modules` |
| `main.ts` / `app.module.ts` | Everything — it is the composition root | — |

The application layer may import `@nestjs/common` for `@Injectable`/`@Inject` because DI is a
composition concern, not an infrastructure one. The **domain layer may not** — it stays
framework-free and constructible with `new`.

---

## 3. Ports as TypeScript interfaces

A port is a plain TypeScript `interface` in `domain/`. It speaks the domain language, uses
domain types, and rejects with domain errors.

### Outbound port (driven — repository, publisher, external client)

```ts
// domain/invoice/invoice.repository.interface.ts
import type { Invoice } from './invoice.entity';
import type { InvoiceNumber } from './invoice-number.vo';

export interface InvoiceRepository {
  findByNumber(number: InvoiceNumber): Promise<Invoice | null>;
  save(invoice: Invoice): Promise<void>;
  listOverdue(asOf: Date): Promise<readonly Invoice[]>;
}
```

Rules:

- Business-intent method names (`findByNumber`, `listOverdue`) — never infra-shaped
  (`findOne(where)`, `raw(sql)`).
- Parameters and return values are domain types. A Prisma model never appears in a port
  signature.
- Absence is `null` (or an explicit `Result`), never a thrown "not found" from the adapter.
- Ports return `Promise<T>` — persistence is asynchronous by nature; do not hide it.

### Inbound port (driving — use case interface)

```ts
// domain/invoice/issue-invoice.port.ts
export interface IssueInvoiceCommand {
  readonly customerId: string;
  readonly lines: readonly InvoiceLineInput[];
}

export interface IssueInvoiceUseCase {
  execute(command: IssueInvoiceCommand): Promise<InvoiceIssuedResult>;
}
```

Controllers depend on the inbound port, not on the concrete application service class. This
keeps the HTTP adapter swappable (REST today, a CLI or a message consumer tomorrow) and makes
controller tests trivial.

### Adapters

- Implement the port, live in `infrastructure/`, are annotated `@Injectable()`.
- Translate: Prisma row → domain entity via an explicit mapper; infra exception → domain error.
- Contain **no** orchestration and **no** business rules.
- Never open their own transaction — the application service owns the transaction boundary.

```ts
// infrastructure/persistence/invoice/prisma-invoice.repository.ts
@Injectable()
export class PrismaInvoiceRepository implements InvoiceRepository {
  constructor(private readonly prisma: PrismaService) {}
  async findByNumber(number: InvoiceNumber): Promise<Invoice | null> {
    const row = await this.prisma.invoice.findUnique({ where: { number: number.value } });
    return row ? InvoiceMapper.toDomain(row) : null;
  }
  async save(invoice: Invoice): Promise<void> {
    const data = InvoiceMapper.toPersistence(invoice);
    await this.prisma.invoice.upsert({ where: { id: data.id }, create: data, update: data });
  }
}
```

### Anti-patterns

- A port typed with `Prisma.InvoiceWhereInput` — that is the ORM leaking through the hexagon.
- An adapter that decides *what* to do (business branching) instead of *how* to store.
- A repository interface declared in `infrastructure/` — the port belongs to the domain, the
  implementation to infrastructure. That inversion is the whole point.
- Injecting `PrismaService` into an application service.

---

## 4. DI tokens

TypeScript interfaces are erased at runtime, so they cannot be used as NestJS providers. Every
port therefore gets an explicit injection token declared **next to the port, in `domain/`**.

```ts
// domain/invoice/invoice.tokens.ts
export const INVOICE_REPOSITORY = Symbol('InvoiceRepository');
export const INVOICE_EVENT_PUBLISHER = Symbol('InvoiceEventPublisher');
export const ISSUE_INVOICE_USE_CASE = Symbol('IssueInvoiceUseCase');
```

Rules:

- Tokens are `Symbol`, not strings — a string token collides silently across modules.
- Token constants are UPPER_SNAKE_CASE and named after the port.
- Tokens live in `domain/<context>/<context>.tokens.ts`. `modules/<context>/<context>.tokens.ts`
  only re-exports the subset the module publishes.
- Binding happens **only** in the module's `providers` array — never with `@Injectable()` on the
  interface (impossible) and never through a service locator.

Typed injection helper (optional but recommended — it prevents a token/type mismatch):

```ts
export const InjectInvoiceRepository = (): ParameterDecorator => Inject(INVOICE_REPOSITORY);
```

### Module wiring

```ts
// modules/invoice/invoice.module.ts
@Module({
  imports: [PrismaModule],
  controllers: [InvoiceController],
  providers: [
    IssueInvoiceService,
    { provide: ISSUE_INVOICE_USE_CASE, useExisting: IssueInvoiceService },
    { provide: INVOICE_REPOSITORY, useClass: PrismaInvoiceRepository },
    { provide: INVOICE_EVENT_PUBLISHER, useClass: AmqpInvoiceEventPublisher },
    { provide: InvoicePricingService, useFactory: () => new InvoicePricingService() },
  ],
  exports: [ISSUE_INVOICE_USE_CASE],
})
export class InvoiceModule {}
```

Notes:

- `useClass` binds the adapter behind the port. Swapping to an in-memory adapter for a test or
  a mock profile is a one-line change in this array — nothing else in the service moves.
- `exports` is the module's public API. If it is not exported, no other module can reach it.
- Domain services are **not** `@Injectable()` (they must stay framework-free); they are
  registered with `useFactory` — the Node counterpart of the Java `DomainServiceConfig`.

---

## 5. Application services vs domain services

### Application services (`modules/<context>/*.service.ts`)

- Implement an inbound port; one class per use case (or one cohesive class per aggregate).
- Orchestrate: load through outbound ports, invoke domain behaviour, persist, publish events.
- Own the transaction boundary and resilience policies (retry, circuit breaker, timeout).
- Require the empresa from the context before touching any repository (RULE-07).
- Contain no `if` that encodes a business rule — that belongs to the entity or the domain service.

### Domain services (`domain/<context>/*.domain-service.ts`)

- Pure rules spanning several entities but owned by none of them.
- Plain classes, constructed with `new`, zero NestJS decorators, zero I/O.
- Unit-testable without `Test.createTestingModule`.

---

## 6. Transaction boundaries

- Transactions are opened **only** by application services, through a `TransactionManager` port
  implemented over `prisma.$transaction`.
- Controllers, repositories and mappers never open a transaction.
- The port keeps Prisma out of the application layer:

```ts
// domain/shared/transaction-manager.port.ts
export interface TransactionManager {
  run<T>(work: () => Promise<T>): Promise<T>;
}
```

The Prisma implementation uses an `AsyncLocalStorage` to expose the interactive transaction
client to the repositories participating in the current unit of work, so adapters remain
unaware of whether they run inside a transaction.

- Concurrent updates use optimistic locking: a `version` column bumped in the `update` `where`
  clause; a zero-row update raises a domain `ConcurrentModificationError`.

---

## 7. Prisma boundary rules (D-545)

- `schema.prisma` is infrastructure. Prisma models are **persistence models**, not domain
  entities — a mapper always sits between them.
- `@map`/`@@map` translate snake_case database identifiers to camelCase TypeScript.
- `PrismaService` extends `PrismaClient` and lives in `infrastructure/prisma/`. It is injected
  only into repositories.
- Generated Prisma types never appear in `domain/`, in DTOs, or in HTTP responses.
- Migrations: `prisma migrate dev` locally, `prisma migrate deploy` in CI/CD. Migration files
  are committed and never edited after they have been applied to a shared environment.
- Raw SQL (`$queryRaw`) is allowed only inside a repository, always parameterized, and always
  with a comment justifying why the query builder was insufficient.

---

## 8. DTOs, mapping and the anti-corruption layer

- `modules/<context>/dto/` holds request/response DTOs, validated by `class-validator`.
- Three distinct shapes, three explicit mappings: **DTO ↔ domain entity ↔ Prisma model**.
  Never collapse them into one type "to avoid duplication" — they change for different reasons.
- Mappers are static classes or pure functions in `infrastructure/persistence/<context>/`
  (persistence side) and in `modules/<context>/` (API side).
- Integrations with external systems get an anti-corruption layer in `infrastructure/http/`: the foreign schema is translated into domain types at the edge,
  never propagated inward.
---

## 9. EmpresaContext propagation

Node has no thread-local. The equivalent is `AsyncLocalStorage`, which survives `await`
boundaries within the same asynchronous execution context.

```ts
// infrastructure/auth/empresa-context.ts
import { AsyncLocalStorage } from 'node:async_hooks';

interface RequestContext {
  readonly empresaId: string;
  readonly correlationId: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export const EmpresaContext = {
  runWith<T>(ctx: RequestContext, work: () => T): T {
    return storage.run(ctx, work);
  },
  require(): RequestContext {
    const ctx = storage.getStore();
    if (!ctx) throw new MissingContextError('EmpresaContext not set');
    return ctx;
  },
  get(): RequestContext | undefined {
    return storage.getStore();
  },
};
```

Rules:

- A NestJS middleware (registered before every guard) extracts the empresa from
  the validated JWT and wraps the rest of the request in `runWith`. There is no `clear()` — the
  store dies with the async context, which is exactly why `AsyncLocalStorage` is safer than a
  hand-rolled global.
- The pino logger reads `correlationId` and `empresaId` from the same store, so
  every log line is correlated without being passed around.
- `PrismaService` sets `search_path` from the context at the start of each unit of work.

### Cross-empresa access guard

`EmpresaContext.require()` proves **who** the caller is, not
**which** resources it may touch. Any use case creating a child entity under a parent must load
the parent scoped to the current empresa
(`findByIdAndEmpresaId`) and raise `ParentNotFoundError` when it is
absent — **before** constructing the child. Skipping that check silently lets
empresa A write into empresa B's aggregate.
---

## 10. ESLint boundaries — the ArchUnit equivalent

`eslint-plugin-boundaries` enforces the layer rules at lint time. This is the Node counterpart
of the Java ArchUnit RULE-01..09 and it is a **hard CI gate**, not advisory.

```js
// eslint.config.mjs (excerpt)
settings: {
  'boundaries/elements': [
    { type: 'domain',         pattern: 'src/domain/**' },
    { type: 'application',    pattern: 'src/modules/**' },
    { type: 'infrastructure', pattern: 'src/infrastructure/**' },
    { type: 'composition',    pattern: 'src/{main.ts,app.module.ts}' },
  ],
},
rules: {
  'boundaries/element-types': ['error', {
    default: 'disallow',
    rules: [
      { from: 'domain',         allow: ['domain'] },
      { from: 'application',    allow: ['domain', 'application'] },
      { from: 'infrastructure', allow: ['domain', 'infrastructure'] },
      { from: 'composition',    allow: ['domain', 'application', 'infrastructure'] },
    ],
  }],
  'no-restricted-imports': ['error', {
    patterns: [
      { group: ['@nestjs/*', '@prisma/client'], message: 'RULE-01/02: domain must stay framework-free' },
    ],
  }],
},
```

| Rule | Intent | Java equivalent |
|---|---|---|
| RULE-01 | `domain` does not import `@nestjs/*` | ArchUnit RULE-01 |
| RULE-02 | `domain` does not import `@prisma/client` | ArchUnit RULE-02 |
| RULE-03 | Only application services call `TransactionManager.run` | ArchUnit RULE-03 |
| RULE-04 | Controllers do not import `infrastructure` | ArchUnit RULE-04 |
| RULE-05 | `infrastructure` does not import `modules` | ArchUnit RULE-05 |
| RULE-06 | Outbound HTTP clients live only in `infrastructure/http` | ArchUnit RULE-06 |
| RULE-07 | Application services require the empresa context first | ArchUnit RULE-07 |
| RULE-08 | No `$queryRaw` outside a repository | `open-in-view=false` analogue |
| RULE-09 | A module imports another module, never its internals | ArchUnit RULE-09 |

The `no-restricted-imports` block above is scoped to the `src/domain/**` file group; the
transaction and raw-SQL rules are expressed as additional scoped `no-restricted-syntax`
entries. CI runs `pnpm lint` as the `architectureCheck` equivalent.

---

## 11. PR checklist

### Automated
- `pnpm lint` green (boundary rules included).
- `pnpm format:check` green.
- `pnpm test` and `pnpm test:e2e` green.
- `tsc --noEmit` green with `strict: true`.

### Manual
- Every new port is an interface in `domain/` with a `Symbol` token beside it.
- Every adapter implements a port and lives in `infrastructure/`.
- No `PrismaService` injected outside `infrastructure/`.
- No Prisma model in a DTO, a controller signature, or a port signature.
- One NestJS Module per bounded context; new cross-module access goes through `exports`.
- Transactions opened only in application services.
- `EmpresaContext.require()` called before the first repository call.
- Parent entity loaded scoped to the empresa before creating a child.
- Domain services registered with `useFactory`, not decorated with `@Injectable()`.

---

## References

- `node-conventions.md` — TypeScript, ESLint/Prettier, naming, imports, DI style
- `node-testing-conventions.md` — test pyramid, factories, testcontainers
- `../adr/ADR-001-hexagonal-node.md` — NestJS Module as bounded context
- `services-catalog.md` — service catalog
- `docs/architecture/shared/multi-empresa.md` — schema-per-empresa strategy
