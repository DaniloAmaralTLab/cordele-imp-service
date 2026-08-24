# Services Catalog (Cordelê Backend)

> Quick-reference catalog of every backend microservice:
> canonical Java package, Gradle project key, one-line responsibility, key ports and events.

Use this file when you:
- Start a new service -- to find the canonical package and the project key.
- Write an `applyTo` in CI, or a cross-reference.
- Need to know which service owns which domain boundary.

> **Updates:** this catalog is updated by `/be-architect-vision <MODULE>` whenever
> a new module is registered. Edit it by hand only when you add capabilities
> to an existing service (events, Feign clients).

---

## 1. Service Map

| Component | Gradle project key | Canonical package | Module |
|---|---|---|---|
| `imp-service` | `:services:imp-service` | `@cordele.imp` | IMP |
| `comp-service` | `:services:comp-service` | `@cordele.comp` | COMP |
| `pub-service` | `:services:pub-service` | `@cordele.pub` | PUB |
| `proj-service` | `:services:proj-service` | `@cordele.proj` | PROJ |

| `cordele-migrations` | `:services:cordele-migrations` | `@cordele.migrations` | -- |

---

## 2. Responsibility summary

### `imp-service` -- `@cordele.imp` (IMP)
- Parsing e estruturação de manuscritos DOCX e Markdown

### `comp-service` -- `@cordele.comp` (COMP)
- Configuração de metadados e ajuste de layout editorial

### `pub-service` -- `@cordele.pub` (PUB)
- Geração, validação (epubcheck) e download do ePub 3

### `proj-service` -- `@cordele.proj` (PROJ)
- Gestão do ciclo de vida de projetos editoriais e histórico de publicações

### `cordele-migrations` -- `@cordele.migrations`
- Centralized Flyway: runs migrations on every schema (`cordele_global` + the empresas schemas prefixed with ``).
- Runs **before** the other services (`ddl-auto: validate` on all of them).
- Migrations split by path: `db/migration/global/V*.sql` and `db/migration/empresa/V*.sql`.

---

## 3. Canonical internal structure

Every service (except `cordele-migrations`) uses the hexagonal layout:

```
@cordele.<module>/
├── api/
│   ├── controller/          # @RestController
│   ├── dto/                 # Java records (Request/Response)
│   └── exception/           # @RestControllerAdvice (ProblemDetail)
├── application/
│   ├── service/             # @Service, @Transactional, EmpresaContextHolder.require()
│   └── port/
│       ├── in/              # Use-case interfaces
│       └── out/             # Repository + external service interfaces
├── domain/
│   ├── model/               # Pure POJO -- zero Spring, zero JPA
│   └── service/             # Domain business rules
└── infrastructure/
    ├── clients/             # @FeignClient
    ├── config/              # @Configuration, DomainServiceConfig
    ├── persistence/
    │   ├── entity/          # @Entity JPA
    │   ├── repository/      # Spring Data JPA @Repository
    │   └── adapter/         # Port.out implementations
    └── security/            # Filters, EmpresaContextHolder, CorrelationIdInterceptor
```

Details in `hexagonal-patterns.md`.

---

## 4. ArchUnit base reference

Each `ArchitectureTest.java` uses its own canonical package:

```java

// imp-service:
@AnalyzeClasses(packages = "@cordele.imp")

// comp-service:
@AnalyzeClasses(packages = "@cordele.comp")

// pub-service:
@AnalyzeClasses(packages = "@cordele.pub")

// ... and so on for the other services
```

---

## 5. Gradle commands per service

```bash
# Replace <project-key> with the Gradle key (Section 1)
./gradlew :services:<project-key>:architectureCheck    # ArchUnit -- BLOCKING
./gradlew :services:<project-key>:test                 # unit tests (@Tag("unit"))
./gradlew :services:<project-key>:integrationTest      # integration + BDD (Testcontainers)
./gradlew :services:<project-key>:build                # full build + all checks

# All services
./gradlew build                               # full monorepo build
./gradlew check                               # lint + test + archUnit
```

---

## 7. Feign Client Registry

> List populated by `/be-architect-vision <MODULE>` as inter-service integrations are identified.

| Feign interface | Consumer service | Provider service | `@FeignClient(name = ...)` |
|---|---|---|---|
| _(populated as services declare Feign integrations)_ | -- | -- | -- |

The list grows as integrations are identified in the per-service SPECs.

---

## References

- `docs/architecture/backend/standards/hexagonal-patterns.md`
- `docs/architecture/backend/standards/java-conventions.md`
- `docs/architecture/backend/standards/platform-patterns.md` (Feign, Flyway, MDC, Saga)
- `docs/architecture/shared/multi-empresa.md` (ADR-001 schema-per-empresa)
- `docs/architecture/shared/distributed-architecture.md`
