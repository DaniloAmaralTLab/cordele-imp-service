# Node Testing Conventions (Cordelê Backend)

> Test pyramid for Node.js services: Unit · Integration · API/E2E · BDD · CDC.
> Runner: Jest. HTTP: supertest. Real infrastructure: testcontainers-node.

## Purpose

Defines how every Node.js service under `backend/services/` is tested: the pyramid, the folder
layout, the dependencies, the container lifecycle, the factory pattern, and the CI gates.

## Scope

- Unit tests: Jest only — no NestJS context, no database, no network.
- Integration tests: `@nestjs/testing` + testcontainers with a real PostgreSQL.
- API / E2E tests: supertest against the fully bootstrapped Nest application.
- BDD: jest-cucumber — mandatory for changes to the API surface.
- CDC: Pact JS — consumer/provider contract verification.

---

## 1. Test pyramid

| Level | Tools | Scope | pnpm script |
|---|---|---|---|
| Unit | Jest · ts-jest | `src/domain/**` — pure logic, no framework, no I/O | `pnpm test:unit` |
| Integration | Jest · `@nestjs/testing` · testcontainers | Repositories, mappers, adapters | `pnpm test:integration` |
| API / E2E | Jest · supertest · testcontainers | HTTP contract of the bootstrapped app | `pnpm test:e2e` |
| BDD | jest-cucumber · supertest | Behavioural API contracts from the SPECs | `pnpm test:bdd` |
| CDC | Pact JS | Consumer-provider HTTP contracts | `pnpm test:contract` |

Rule of thumb: the domain layer carries the bulk of the assertions and runs in milliseconds;
integration and E2E prove the wiring, not the business rules.

---

## 2. Directory layout

```
services/<service>/
├── src/
│   └── **/*.spec.ts                  # unit tests, colocated with the subject
└── test/
    ├── setup/
    │   ├── jest.setup.ts             # global matchers, deterministic clock, timezone
    │   ├── postgres-container.ts     # singleton PostgreSQL testcontainer
    │   └── test-app.ts               # buildTestApp(): bootstraps Nest with test overrides
    ├── factories/
    │   ├── <aggregate>.factory.ts    # domain object factory
    │   └── <aggregate>.row.factory.ts # Prisma row factory (persistence fixtures)
    ├── integration/
    │   └── *.integration-spec.ts
    ├── e2e/
    │   └── *.e2e-spec.ts
    ├── bdd/
    │   ├── features/<domain>/*.feature
    │   └── steps/*.steps.ts
    └── contract/
        └── *.pact-spec.ts
```

Unit tests are **colocated** (`invoice.domain-service.spec.ts` next to
`invoice.domain-service.ts`) because they follow the code under refactor. Everything that needs
infrastructure lives under `test/`, where the container lifecycle is centralised.

---

## 3. Jest configuration

One `jest.config.ts` per service, using Jest **projects** so each level can be run in isolation
and with a different timeout.

```ts
import type { Config } from 'jest';

const base = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  moduleNameMapper: { '^src/(.*)$': '<rootDir>/src/$1' },
  setupFilesAfterEnv: ['<rootDir>/test/setup/jest.setup.ts'],
  clearMocks: true,
  restoreMocks: true,
};

const config: Config = {
  projects: [
    { ...base, displayName: 'unit', testMatch: ['<rootDir>/src/**/*.spec.ts'] },
    { ...base, displayName: 'integration', testMatch: ['<rootDir>/test/integration/**/*.integration-spec.ts'], testTimeout: 60_000 },
    { ...base, displayName: 'e2e', testMatch: ['<rootDir>/test/e2e/**/*.e2e-spec.ts'], testTimeout: 60_000 },
    { ...base, displayName: 'bdd', testMatch: ['<rootDir>/test/bdd/**/*.steps.ts'], testTimeout: 60_000 },
    { ...base, displayName: 'contract', testMatch: ['<rootDir>/test/contract/**/*.pact-spec.ts'] },
  ],
  coverageThreshold: {
    './src/domain/': { statements: 90, branches: 85, functions: 90, lines: 90 },
    global: { statements: 70, branches: 60, functions: 70, lines: 70 },
  },
};

export default config;
```

Rules:

- `clearMocks` and `restoreMocks` are always on — a leaking mock is a flaky suite.
- Coverage thresholds are asymmetric on purpose: the domain layer is held to a high bar,
  infrastructure is covered by integration tests rather than by line count.
- No global `--forceExit`. A suite that will not exit is leaking a handle; fix the leak.
- Timers and dates are controlled through an injected `Clock` port, not by mutating `Date`.

---

## 4. Unit tests

Rules:

- Subject: `src/domain/**` only — entities, value objects, domain services.
- No `Test.createTestingModule`, no database, no HTTP, no NestJS import.
- Dependencies are hand-written fakes or `jest.fn()`; a domain object is constructed with `new`.
- Each test runs in milliseconds. If it does not, it is not a unit test.
- Assert on behaviour and on domain errors, never on the shape of an internal field.

```ts
describe('InvoicePricingService', () => {
  it('rejects a discount above the approval threshold', () => {
    const service = new InvoicePricingService(policy);
    expect(() => service.applyDiscount(anInvoice(), Percentage.of(45))).toThrow(
      DiscountAboveThresholdError,
    );
  });
});
```

---

## 5. Factory pattern

Every test that needs data goes through a factory. Inline object literals spread across specs
are the single largest source of test-maintenance cost when a field is added.

Two families, deliberately separate:

- **Domain factories** (`test/factories/<aggregate>.factory.ts`) — build valid domain objects.
- **Row factories** (`test/factories/<aggregate>.row.factory.ts`) — build Prisma input rows for
  seeding the database directly, bypassing the domain.

```ts
// test/factories/invoice.factory.ts
let seq = 0;

export const anInvoice = (overrides: Partial<InvoiceProps> = {}): Invoice =>
  Invoice.rehydrate({
    id: `inv-${++seq}`,
    number: InvoiceNumber.of(`INV-${String(seq).padStart(6, '0')}`),
    customerId: 'cus-1',
    status: InvoiceStatus.Draft,
    empresaId: 'emp_aetos',
    lines: [anInvoiceLine()],
    ...overrides,
  });
```

Rules:

- Factories return a **valid** object by default; a test states only what it cares about via
  `overrides`. A test that overrides five fields is a signal the factory default is wrong.
- Unique fields come from a module-level counter, never from `Math.random()` — reproducibility
  matters more than realism.
- Factories are pure builders. They never touch the database; seeding is an explicit call.
- Faker is allowed for cosmetic fields only, always with a fixed seed.

---

## 6. Integration tests with testcontainers

Rules:

- Use a **real PostgreSQL** container. SQLite, `pg-mem`, and mocked Prisma clients are forbidden
  — they diverge exactly on the behaviour (constraints, transactions, `search_path`) that
  integration tests exist to verify.
- One **singleton container per worker**, started in a global setup and reused across files.
  Starting a container per test file multiplies the suite runtime by the file count.
- Isolation between tests is achieved by truncating tables (or by wrapping each test in a rolled
  back transaction), never by restarting the container.
- Migrations are applied once, with `prisma migrate deploy`, against the container URL.

```ts
// test/setup/postgres-container.ts
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';

let container: StartedPostgreSqlContainer | undefined;

export const startPostgres = async (): Promise<string> => {
  container ??= await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('cordele_test')
    .withUsername('test')
    .withPassword('test')
    .withReuse()
    .start();
  const url = container.getConnectionUri();
  process.env.DATABASE_URL = url;
  execSync('pnpm prisma migrate deploy', { env: process.env, stdio: 'inherit' });
  return url;
};
```
The migration step also provisions `cordele_global` plus at least two
empresa schemas, so isolation can actually be asserted (see §10).
### Wiring the Nest context

`@nestjs/testing` builds the module graph; `overrideProvider` swaps only what must not be real.

```ts
// test/setup/test-app.ts
export const buildTestApp = async (): Promise<INestApplication> => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(CLOCK)
    .useValue(new FixedClock('2026-01-01T00:00:00Z'))
    .overrideGuard(JwtAuthGuard)
    .useValue(new AlwaysAllowGuard())
    .compile();
  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.init();
  return app;
};
```

Rules:

- Override the **clock**, the **identity provider**, and genuinely external third parties.
  Never override the repository in an integration test — the repository is the subject.
- The test app must apply the same global pipes, filters and interceptors as `main.ts`.
  A test that passes because the `ValidationPipe` was missing proves nothing.
- `await app.close()` in `afterAll` — an unclosed Nest app leaks the Prisma pool.
---

## 7. API / E2E tests with supertest

Rules:

- One suite per controller; the subject is the HTTP contract, not the business rule.
- Assert the status code, the response body shape, and the persisted side effect.
- Authentication is exercised at least once per controller with a real token shape — do not let
  the always-allow guard hide a missing `@UseGuards`.

```ts
describe('POST /api/v1/invoices', () => {
  it('creates an invoice and returns 201 with its id', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/invoices')
      .set('Authorization', `Bearer ${token}`)
      // NOTE: X-Empresa-Id is NOT sent. Empresa context is resolved server-side from the
      // `empresa_id` claim in the JWT (EmpresaContextInterceptor). The header is never read.
      .send(aCreateInvoiceRequest())
      .expect(201);
    expect(response.body).toMatchObject({ id: expect.any(String) });
  });
  it('rejects an unknown field with 400', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...aCreateInvoiceRequest(), unexpected: true })
      .expect(400);
  });
});
```

---

## 8. BDD tests (jest-cucumber)

Rules:

- Mandatory for any PR that changes the API surface (controllers, DTOs, OpenAPI).
- Feature files are the canonical behavioural spec and stay aligned with the SPECs in
  `docs/architecture/backend/services/<service>/`.
- Step definitions are thin — they delegate to factories and to a shared scenario context.
- Tags: `@smoke`, `@integration`, `@slow`, `@wip`, `@idempotency`, `@pending`, `@multi-empresa`.
- `@pending` marks scenarios whose steps depend on an unimplemented service. They are excluded
  from the default run but remain as documentation; remove the tag when the dependency lands.

```gherkin
Feature: Invoice issuing

  Background:
    Given the empresa "emp_aetos" is active
    And the user "admin@example.com" is authenticated
  @smoke
  Scenario: An invoice is issued successfully
    Given a valid invoice request
    When the client sends it to POST /api/v1/invoices
    Then the response status is 201
    And the field "id" is returned
```

```ts
// test/bdd/steps/invoice-issuing.steps.ts
const feature = loadFeature('test/bdd/features/invoice/invoice-issuing.feature');

defineFeature(feature, (test) => {
  test('An invoice is issued successfully', ({ given, when, then, and }) => {
    /* thin steps delegating to factories + supertest */
  });
});
```

---

## 9. CDC tests (Pact JS)

Rules:

- Consumer side declares the expected interaction and publishes the pact to the broker.
- Provider side verifies the published pact in CI against the running application.
- Provider states are set up through the factories, not through raw SQL.
```ts
const provider = new PactV3({ consumer: 'comp-service', provider: 'imp-service' });

provider
  .given('an invoice exists')
  .uponReceiving('a request for an invoice by id')
  .withRequest({ method: 'GET', path: '/api/v1/invoices/inv-001' })
  .willRespondWith({ status: 200, body: like({ id: 'inv-001', status: 'ISSUED' }) });
```

Any change to a DTO consumed by a sibling service requires a green pact before the old shape is
removed.
---

## 10. Multi-empresa in tests

Every suite touching empresa data must include at least one
`@multi-empresa` scenario asserting isolation:

- Empresa A writes a record → empresa B does not see it in a list.
- Empresa A cannot mutate empresa B's record — the parent lookup raises
  `ParentNotFoundError`, not a `403` leaked from the authorization layer.
- Switching the active empresa at runtime goes through the same
  `AsyncLocalStorage` context the production middleware uses — never by mutating a global in the
  test.
- At least two empresas are provisioned in the test container so the
  assertion is meaningful.
---

## 11. Anti-patterns

- **Mocking Prisma** in what is labelled an integration test — it verifies the mock, not the
  schema.
- **`jest.mock()` on an internal module** to reach a private branch; the branch belongs to the
  domain and should be reachable through the public API.
- **Snapshot tests on API responses** — they lock in accidental fields and are updated blindly
  under time pressure. Assert the fields the contract promises.
- **`sleep(500)`** to wait for async work — poll with a timeout instead.
- **Shared mutable state between test files** (a seeded row every suite depends on). Each file
  seeds what it needs.
- **`expect(true).toBe(true)`** placeholders left behind after a spike.
- **Tests asserting log output** instead of behaviour.

---

## 12. CI enforcement

- `pnpm lint` (including the boundary rules), `pnpm format:check` and `tsc --noEmit` run before
  the tests; a type error is a build failure, not a test failure.
- `pnpm test:unit` runs on every push — it must stay under a minute.
- `pnpm test:integration`, `pnpm test:e2e` and `pnpm test:bdd` run on every PR.
- A PR changing the API surface without a matching feature file fails the
  `feature-coverage-check` job. Opt-out requires the explicit `no-bdd-required` label.
- Coverage thresholds are enforced by Jest itself, so a drop fails the job rather than a report.
- Docker must be available on the runner; testcontainers is a hard dependency of the PR gate.

---

## 13. PR checklist

- [ ] New domain logic has unit tests under `src/domain/**`.
- [ ] New or changed repositories have integration tests against a real PostgreSQL container.
- [ ] API surface changes include or update a feature file plus an E2E test.
- [ ] Test data goes through a factory — no inline object literals duplicated across specs.
- [ ] No mocked Prisma client in an integration or E2E test.
- [ ] `await app.close()` in `afterAll`; no leaking handles, no `--forceExit`.
- [ ] At least one `@multi-empresa` isolation scenario if the service touches empresa data.
- [ ] `pnpm lint` green — boundary rules included.
- [ ] Coverage thresholds met; any intentional gap is justified in the PR description.

---

## References

- [Jest](https://jestjs.io/)
- [Testcontainers for Node.js](https://node.testcontainers.org/)
- [supertest](https://github.com/ladjs/supertest)
- [jest-cucumber](https://github.com/bencompton/jest-cucumber)
- [Pact JS](https://docs.pact.io/implementation_guides/javascript)
- `node-conventions.md` — TypeScript, ESLint/Prettier, naming
- `node-hexagonal-patterns.md` — boundary rules that shape the tests
- `docs/architecture/shared/multi-empresa.md` — isolation between empresas
