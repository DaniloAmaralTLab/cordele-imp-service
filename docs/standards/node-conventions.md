# Node Conventions (Cordelê Backend)

> TypeScript + NestJS conventions for every Node.js service under `backend/services/`.
> Runtime: Node.js 22 LTS. Package manager: pnpm. Framework: NestJS (D-544).

## TypeScript configuration (strict is non-negotiable)

`tsconfig.base.json` at the repository root is the single source of truth; every service
extends it and never relaxes a flag locally.

```jsonc
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "commonjs",
    "moduleResolution": "node",
    "lib": ["ES2023"],
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictPropertyInitialization": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": true,
    "forceConsistentCasingInFileNames": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "declaration": true,
    "sourceMap": true,
    "skipLibCheck": true
  }
}
```

Rules:

- `any` is forbidden. Use `unknown` plus a narrowing guard, or a proper type.
- `@ts-ignore` is forbidden; `@ts-expect-error` is allowed only with a one-line justification
  and a linked issue.
- Non-null assertion (`!`) is forbidden outside test fixtures — narrow instead.
- Prefer `type` for unions/aliases and `interface` for object contracts implemented by classes
  (ports are interfaces — see `node-hexagonal-patterns.md`).
- Public exported functions declare an explicit return type.
- No default exports — named exports only (predictable refactors and barrel files). The only
  exemption is tooling config files (`eslint.config.mjs`, `jest.config.ts`), which the ecosystem
  requires to default-export.

## ESLint

Flat config (`eslint.config.mjs`) at the repository root, extended per service only to add
paths — never to disable a rule.

```js
// eslint.config.mjs
import tseslint from 'typescript-eslint';
import boundaries from 'eslint-plugin-boundaries';
import importPlugin from 'eslint-plugin-import';

export default tseslint.config(
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    plugins: { boundaries, import: importPlugin },
    languageOptions: {
      parserOptions: { project: ['./tsconfig.json'], tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/require-await': 'error',
      'no-console': 'error',
      'import/no-default-export': 'error',
      'import/order': ['error', { /* see "Import ordering" below */ }],
    },
  },
);
```

`eslint-plugin-boundaries` enforces the hexagonal layer rules — the Node equivalent of the
Java ArchUnit suite. The rule set lives in `node-hexagonal-patterns.md` §ESLint boundaries.

## Prettier

`.prettierrc` at the repository root, applied by `pnpm format`. Prettier owns formatting;
ESLint owns correctness. Never re-implement formatting rules in ESLint.

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "arrowParens": "always",
  "endOfLine": "lf"
}
```

CI runs `pnpm lint` and `pnpm format:check`; both must be green before merge.

## Naming conventions

| Element | Convention | Example |
|---|---|---|
| Classes, interfaces, enums, decorators | PascalCase | `InvoiceService`, `InvoiceRepository` |
| Methods, functions, variables, properties | camelCase | `calculateTotal`, `pendingItems` |
| Constants and DI tokens | UPPER_SNAKE_CASE | `MAX_RETRIES`, `INVOICE_REPOSITORY` |
| Type parameters | Single capital or PascalCase | `T`, `TPayload` |
| Files and directories | kebab-case + role suffix | `invoice.controller.ts` |
| Test files | mirror the subject + `.spec.ts` | `invoice.service.spec.ts` |
| E2E test files | `.e2e-spec.ts` | `invoice.e2e-spec.ts` |
| Environment variables | UPPER_SNAKE_CASE | `DATABASE_URL` |
| Database identifiers | snake_case (mapped via Prisma `@map`) | `invoice_line_item` |

File-name suffixes are part of the contract — the generators and the ESLint boundary rules
match on them:

`*.module.ts` · `*.controller.ts` · `*.service.ts` · `*.entity.ts` · `*.repository.interface.ts`
· `*.repository.ts` · `*.mapper.ts` · `*.dto.ts` · `*.guard.ts` · `*.strategy.ts` ·
`*.interceptor.ts` · `*.filter.ts` · `*.pipe.ts` · `*.producer.ts` · `*.consumer.ts` ·
`*.tokens.ts` · `*.factory.ts`

Interfaces are **not** prefixed with `I`. A port is `InvoiceRepository`; its Prisma
implementation is `PrismaInvoiceRepository`.

## Import ordering

Enforced by `import/order` with `@typescript-eslint/consistent-type-imports`. One blank line
between groups, alphabetical inside each group, type-only imports written as `import type`.

```js
'import/order': ['error', {
  groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
  pathGroups: [
    { pattern: '@nestjs/**', group: 'external', position: 'before' },
    { pattern: '@cordelê/**', group: 'internal' },
  ],
  pathGroupsExcludedImportTypes: ['@nestjs/**'],
  'newlines-between': 'always',
  alphabetize: { order: 'asc', caseInsensitive: true },
}],
```

Resulting shape:

```ts
import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';

import { Invoice } from '../../domain/invoice.entity';
import type { InvoiceRepository } from '../../domain/invoice.repository.interface';
import { INVOICE_REPOSITORY } from '../../domain/invoice.tokens';
```

Node built-ins always use the `node:` protocol (`node:fs`, `node:crypto`). Relative imports
never cross a layer boundary — cross-layer access goes through the port interface and the
DI token.

## Dependency injection

- Constructor injection only. Property injection is forbidden.
- Constructor parameters are `private readonly`.
- Depend on the **port interface** plus an injection token, never on the concrete adapter class.
- `@Injectable()` on application and infrastructure classes; **never** on `domain/` classes.

```ts
@Injectable()
export class CreateInvoiceService {
  constructor(
    @Inject(INVOICE_REPOSITORY) private readonly invoices: InvoiceRepository,
    private readonly clock: Clock,
  ) {}
}
```

See `node-hexagonal-patterns.md` §DI tokens for the token declaration pattern.

## Async and error handling

- `async`/`await` everywhere; no raw `.then()` chains, no callbacks.
- Every promise is awaited or explicitly handed to a supervisor —
  `@typescript-eslint/no-floating-promises` is an error.
- Use `Promise.all` for independent I/O; never `await` inside a loop over independent work.
- Domain failures are domain exception classes in `domain/exception/`, extending a shared
  `DomainError`. They carry business meaning, never HTTP status codes.
- A global `@Catch()` exception filter maps domain errors to RFC 7807 `application/problem+json`
  responses. Infrastructure errors are translated into domain errors by the adapter that
  produced them.
- Never `throw` a string or a plain object. Never swallow an error silently.

```ts
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost): void { /* map to problem+json */ }
}
```

## Validation

- Request DTOs live in `dto/`, are classes, and are annotated with `class-validator`.
- A global `ValidationPipe` runs with `{ whitelist: true, forbidNonWhitelisted: true, transform: true }`
  so unknown fields are rejected, not silently dropped.
- Controllers validate shape; application services validate business rules.
- Configuration is validated at boot through a typed `ConfigModule` schema — the process must
  fail fast on a missing or malformed environment variable, never lazily at first use.

## Logging

- `nestjs-pino` with structured JSON output. `console.log` is forbidden (`no-console: error`).
- The logger is injected, never constructed ad hoc.
- Every log line carries `correlationId` and `empresaId`, propagated through
  `AsyncLocalStorage` (the Node equivalent of the Java MDC/ThreadLocal).
- Structured fields, never string concatenation: `logger.info({ invoiceId }, 'invoice created')`.
- Levels: `info` for normal events, `warn` for unexpected but handled situations, `error` for
  failures, `debug` for development detail.
- Never log secrets, tokens, or personal data. Redaction paths are configured in the pino options.

## Immutability

- `readonly` on every field that is not reassigned; `ReadonlyArray<T>` for collections crossing
  a boundary.
- Domain entities expose behaviour, not setters. State transitions return a new instance or go
  through an intent-revealing method (`invoice.approve(approver)`).
- `const` by default; `let` only when reassignment is genuinely required. `var` is forbidden.

## API surface

- REST paths are versioned: `/api/v1/...`. A breaking change requires a new version and an ADR.
- `@nestjs/swagger` decorators on every controller and DTO; the generated OpenAPI document feeds
  `docs/architecture/shared/contratos/<service>-openapi.yaml`.
- Controllers return DTOs. A Prisma model never reaches the HTTP layer.
- Every endpoint is authenticated except `/health` and `/metrics`.

## Configuration and secrets

- `@nestjs/config` with a typed, validated schema; access through a typed config service,
  never `process.env` scattered across the code.
- `.env` files are never committed. Secrets come from the environment.
- Profiles are expressed as `NODE_ENV` plus explicit feature flags, not as branching on hostnames.

## Package management (pnpm)

- `pnpm-workspace.yaml` declares `backend/services/*`; every service is a workspace member.
- `pnpm-lock.yaml` is committed and CI installs with `--frozen-lockfile`.
- Dependency versions are pinned by the lockfile; ranges stay caret (`^`) in `package.json`.
- The Node version is pinned in `.nvmrc` and in `engines.node` of every `package.json`
  (`>=22`).
- Scripts are uniform across services: `build`, `start:dev`, `lint`, `format:check`, `test`,
  `test:e2e`, `prisma:migrate`.
## Multi-empresa

- The empresa is resolved once, in a NestJS middleware/guard, and stored in
  `AsyncLocalStorage` as `empresaContext`.
- Every application service that touches empresa data begins by requiring the
  context (`empresaContext.require()`) — the Node equivalent of RULE-07.
- The Prisma client sets `search_path` per request from that context; repositories never take a
  empresa id as an ad hoc parameter.
- Details in `docs/architecture/shared/multi-empresa.md`.
## Documentation

- TSDoc on exported classes and public methods with non-obvious behaviour; document `@param`,
  `@returns`, and `@throws`.
- Do not restate the type in prose. Explain intent and invariants.

## Testing

- **Unit:** Jest, no NestJS context, no database — `domain/` only.
- **Integration:** `@nestjs/testing` + `testcontainers` with a real PostgreSQL — never SQLite
  or an in-memory stand-in.
- **E2E / API:** `supertest` against the bootstrapped Nest application.
- See `node-testing-conventions.md` for the full pyramid, factories, and CI tasks.

## References

- `node-hexagonal-patterns.md` — ports & adapters, NestJS Modules as bounded contexts
- `node-testing-conventions.md` — test pyramid, Jest, supertest, testcontainers
- `../adr/ADR-001-hexagonal-node.md` — why a NestJS Module is the bounded context
- `services-catalog.md` — service catalog
