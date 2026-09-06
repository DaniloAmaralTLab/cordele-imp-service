# API v0 Mock Convention (Cordelê Backend)

> Uniform convention: every microservice must expose an `/api/v0/` surface
> backed by mock data, enabled through the Spring profile `mock`. Goal: unblock the FE early,
> allow parallel work, and provide a predictable dev-time API that mirrors the real contracts.

## Principles

- **Minimum friction:** mocks run with a single profile flag or command.
- **Contract-first:** mock endpoints follow the contract (request/response shapes) defined in the SPECs.
- **Isolated:** confined to the `mock` Spring profile -- never in production.
- **Discoverable:** mock data lives at a predictable path in the project tree.

---

## 1. Where to put mocks

```
src/main/java/@cordele/<module>/
└── mock/                        # @Profile("mock") controllers + support code

src/main/resources/
└── mocks/
    └── api/
        └── v0/
            └── <domain>/        # JSON fixture files
```

Example: `src/main/resources/mocks/api/v0/<resource>/get-123.json`

---

## 2. How to enable it

- Enabled through the `mock` Spring profile only.
- Never include `mock` in `prod` or `staging`.
- Never enable `mock` in production deployments.

**Local run (Gradle Kotlin DSL):**
```powershell

.\gradlew :imp-service:bootRun -Dspring.profiles.active=mock
```

**Optional convenience task in `build.gradle.kts`:**
```kotlin
tasks.register<JavaExec>("bootRunMock") {
    group = "application"
    description = "Run with mock profile for frontend development"
    mainClass.set("org.springframework.boot.loader.launch.JarLauncher")
    systemProperty("spring.profiles.active", "mock")
    classpath = sourceSets["main"].runtimeClasspath
}
```

---

## 3. Design rules

- Path prefix: `/api/v0/...`
- Mirror the real paths and shapes. If a SPEC defines `/api/v1/<resource>`, create `/api/v0/<resource>` with the same DTO shape (but mocked content).
- Provide canned JSON responses under `mocks/api/v0/`, loaded by the mock controllers.
- Support simulated latency and optional error injection through properties.
- Annotate with `@Profile("mock")` -- never active by default.

---

## 4. Mock controller example

```java
@RestController
@RequestMapping("/api/v0/<resource>")
@Profile("mock")
@RequiredArgsConstructor
@Slf4j
public class <Resource>MockController {

    private final ResourceLoader loader;
    @Value("${mock.response.delay.ms:0}")
    private long delayMs;
    @GetMapping("/{id}")
    public ResponseEntity<String> get(@PathVariable String id) throws IOException, InterruptedException {
        if (delayMs > 0) Thread.sleep(delayMs);
        Resource r = loader.getResource("classpath:mocks/api/v0/<resource>/get-" + id + ".json");
        if (!r.exists()) return ResponseEntity.notFound().build();
        return ResponseEntity.ok()
            .contentType(MediaType.APPLICATION_JSON)
            .body(new String(r.getInputStream().readAllBytes(), StandardCharsets.UTF_8));
    }
    @GetMapping
    public ResponseEntity<String> list() throws IOException {
        Resource r = loader.getResource("classpath:mocks/api/v0/<resource>/list-page-1.json");
        return ResponseEntity.ok()
            .contentType(MediaType.APPLICATION_JSON)
            .body(new String(r.getInputStream().readAllBytes(), StandardCharsets.UTF_8));
    }
}
```

---

## 5. Mock data organization

```
src/main/resources/mocks/api/v0/
├── <resource-a>/
│   ├── get-123.json
│   ├── list-page-1.json
│   └── list-page-2.json

├── empresas/
│   └── get-empresa-<id>.json

└── <resource-b>/
    └── ...
```

---

## 6. `application-mock.yml` -- latency and error injection

```yaml
mock:
  response:
    delay:
      ms: 200          # simulated network latency
    error:
      rate: 0.0        # 0..1 fraction chance of returning 500 (chaos testing)

spring:
  security:
    oauth2:
      resourceserver:
        jwt:
          # bypass JWT validation in the mock profile
          issuer-uri: http://localhost:9999/mock-issuer

# Local origins allowed in the mock profile
cors:
  allowed-origins: "http://localhost:4200,http://localhost:3000"

# Empresa mock default (multi-empresa)
cordele:
  mock:
    empresa-default: emp_aetos

```

---

## 7. Security Guard -- MockGuard

**Mandatory in every service that implements the mock profile:**

```java
@Configuration
@Profile("mock")
class MockGuard {

    @PostConstruct
    void assertNotProduction() {
        String env = System.getenv("ENV");
        if ("prod".equals(env) || "production".equals(env)) {
            throw new IllegalStateException(
                "mock Spring profile must never be active in production. ENV=" + env);
        }
    }
}
```

---

## 8. Testing mock controllers

- Include unit tests that validate fixture loading.
- CI must guarantee that `mock` is not in the production artifact.
- Add a smoke test that boots the service with the `mock` profile and asserts key endpoints return 200.

---

## 9. Multi-empresa in mock mode

- The `mock` profile must honor `EmpresaContextHolder` (same enforcement as RULE-07).
- Empresa context is resolved from the JWT `empresa_id` claim via `EmpresaContextInterceptor`
  (same path as production). The mock profile does NOT read `X-Empresa-Id` from the request header —
  the FE never sends it and the backend never reads it; empresa context always comes from the JWT.
- Fixtures may carry a per-empresa suffix: `get-123-<empresa-a>.json`, `get-123-<empresa-b>.json`.
- When no valid JWT is present in mock mode, fall back to `cordele.mock.empresa-default` from
  `application-mock.yml`.

---

## 10. PR checklist for mocks

- [ ] Mock endpoints exist under `/api/v0/`, mirroring the SPEC contract.
- [ ] Fixtures in `src/main/resources/mocks/api/v0/`.
- [ ] Mock code annotated with `@Profile("mock")`.
- [ ] `application-mock.yml` with the specific configuration.
- [ ] `MockGuard` implemented and blocking on a production ENV.
- [ ] Local run instructions documented in the service README.
- [ ] Shapes aligned with the SPECs in `docs/architecture/backend/services/<service>/SPEC-*.md`.
- [ ] Multi-empresa honored (header or default).

---

## References

- `docs/architecture/backend/standards/hexagonal-patterns.md`
- `docs/architecture/backend/services/<service>/SPEC-*.md` (per-service contracts)
- `docs/architecture/shared/multi-empresa.md`
