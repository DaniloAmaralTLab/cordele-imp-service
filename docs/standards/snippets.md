# Backend Snippets (Cordelê)

> Opinionated snippets (6-12 lines) + pseudocode for implementing ports/adapters/use-cases + tests.
> Cheat-sheet. For the full rationale, see `hexagonal-patterns.md`.

**Format:** title → target path → snippet → notes → refs

---

## 1) Port -- Persistence (semantic repository)

- Target: `backend/services/<service>/.../application/port/out/**`
- Example: `@cordele.<module>.application.port.out.ClientePort`

```java
// application/port/out/ClientePort.java
public interface ClientePort {
    Optional<Cliente> findByCpfCnpj(String cpfCnpj);
    Cliente save(Cliente cliente);
}
```

- Notes: the port exposes intent (`findByCpfCnpj`) -- it avoids a persistence-leaky API such as `findById(Long)` when there is a clear business key.

---

## 2) Port -- Use Case (input port)

- Target: `backend/services/<service>/.../application/port/in/**`

```java
// application/port/in/CriarClienteUseCase.java
public interface CriarClienteUseCase {
    ClienteResult execute(CriarClienteCommand cmd);
}
```

- Notes: use-case interfaces are the boundary between `api` and `application`. Controllers depend on these, never on concrete service classes.

---

## 3) Port -- External Integration (adapter contract)

- Target: `backend/services/<service>/.../application/port/out/**`

```java
// application/port/out/SefazAdapterPort.java
public interface SefazAdapterPort {
    NFeResponse emitir(NFeRequest request) throws ExternalServiceException;
}
```

- Notes: adapter implementations translate HTTP/SOAP/XML into domain types and map errors to `ExternalServiceException`.

---

## 4) Adapter -- JPA (persistence)

- Target: `backend/services/<service>/.../infrastructure/persistence/adapter/**`

```java
@Component
@RequiredArgsConstructor
class ClienteJpaAdapter implements ClientePort {
    private final ClienteJpaRepository repo;
    private final ClienteMapper mapper;
    public Optional<Cliente> findByCpfCnpj(String cpfCnpj) {
        return repo.findByCpfCnpj(cpfCnpj).map(mapper::toDomain);
    }
    public Cliente save(Cliente cliente) {
        return mapper.toDomain(repo.save(mapper.toEntity(cliente)));
    }
}
```

- Notes: mapping through the MapStruct `ClienteMapper`. The adapter never opens its own transaction.

---

## 5) Adapter -- Feign HTTP client (inter-service)

- Target: `backend/services/<service>/.../infrastructure/clients/**`

```java
// infrastructure/clients/CadastrosClienteClient.java
@FeignClient(name = "cadastros-service")
public interface CadastrosClienteClient {
    @GetMapping("/api/v1/clientes/{id}")
    ClienteDto getById(@PathVariable UUID id,
                       @RequestHeader("X-Empresa-Id") String empresaId);
}
```

- Notes: Feign clients are registered through `@EnableFeignClients`. Apply Resilience4j on the application-service method that calls them.

---

## 6) Adapter -- External HTTP (Resilience4j)

```java
@Component
@RequiredArgsConstructor
class SefazAdapter implements SefazAdapterPort {
    private final WebClient webClient;
    @Retry(name = "sefaz")
    @CircuitBreaker(name = "sefaz")
    @Bulkhead(name = "sefaz")
    public NFeResponse emitir(NFeRequest r) {
        return webClient.post().uri("/nfe/emitir")
            .bodyValue(r)
            .retrieve()
            .bodyToMono(NFeResponse.class)
            .block();
    }
}
```

- Notes: the adapter throws domain-specific exceptions on failure; the Application Service decides the compensation.

---

## 7) Application Service (transactional use-case)

- Target: `backend/services/<service>/.../application/service/**`

```java
@Service
@RequiredArgsConstructor
class CriarClienteService implements CriarClienteUseCase {
    private final ClientePort clientePort;
    private final ClienteDomainService domainService;
    @Transactional
    public ClienteResult execute(CriarClienteCommand cmd) {
        EmpresaContextHolder.require();         // RULE-07 -- mandatory
        var cliente = Cliente.from(cmd);
        domainService.validar(cliente);
        return ClienteResult.from(clientePort.save(cliente));
    }
}
```

- Notes: `@Transactional` only here (RULE-03). Adapters are called inside but do NOT open their own transactions.

---

## 8) Anti-pattern -- @Transactional in the wrong layer

```java
// ❌ BAD: @Transactional on a controller mixes the web concern with the DB transaction
@RestController class ClienteController {
    @Transactional
    @PostMapping public ResponseEntity<?> create(...) { ... }
}

// ❌ BAD: @Transactional on an adapter
@Component class ClienteJpaAdapter implements ClientePort {
    @Transactional
    public Cliente save(Cliente c) { ... }
}
```

---

## 9) EmpresaContextHolder + EmpresaFilter

- Target: `backend/services/<service>/.../infrastructure/security/**`

```java
public final class EmpresaContextHolder {
    private static final ThreadLocal<String> EMPRESA = new ThreadLocal<>();
    public static void set(String e) {
        EMPRESA.set(e);
        MDC.put("empresaId", e);
    }
    public static String require() {
        String e = EMPRESA.get();
        if (e == null) throw new IllegalStateException("EmpresaContext not initialized");
        return e;
    }
    public static void clear() { EMPRESA.remove(); MDC.remove("empresaId"); }
}

@Component
class EmpresaFilter extends OncePerRequestFilter {
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
            throws ServletException, IOException {
        try {
            EmpresaContextHolder.set(req.getHeader("X-Empresa-Id"));
            chain.doFilter(req, res);
        } finally { EmpresaContextHolder.clear(); }
    }
}
```

- Notes: for `@JmsListener`, pass the tenant explicitly from the event envelope; never rely on the web thread's ThreadLocal.

---

## 10) JMS Producer (event publisher)

- Target: `backend/services/<service>/.../infrastructure/messaging/producer/**`

```java
@Component
@RequiredArgsConstructor
class VendaConfirmadaPublisher {
    private final JmsTemplate jms;
    public void publish(VendaConfirmadaEvent event) {
        jms.convertAndSend("cordele.<module>.<entity>.<event>", event.toEnvelope());
    }
}
```

- Notes: the event conforms to the envelope (`eventId`, `eventType`, `occurredAt`, `correlationId`, `version`, `empresaId`, `payload`). See `platform-patterns.md` §1.2.

---

## 11) JMS Consumer (idempotent)

- Target: `backend/services/<service>/.../infrastructure/messaging/consumer/**`

```java
@Component
@RequiredArgsConstructor
@Slf4j
class VendaConfirmadaConsumer {
    private final EmitirNFeUseCase emitirNFe;
    private final ProcessedEventPort processedEvents;
    @JmsListener(destination = "cordele.<module>.<entity>.<event>")
    public void onVendaConfirmada(EventEnvelope envelope) {
        if (processedEvents.alreadyProcessed(envelope.eventId())) return;
        EmpresaContextHolder.set(envelope.empresaId());       // explicit propagation
        try {
            emitirNFe.execute(EmitirNFeCommand.from(envelope));
            processedEvents.markProcessed(envelope.eventId());
        } finally { EmpresaContextHolder.clear(); }
    }
}
```

- Notes: the consumer MUST be idempotent -- check before acting.

---

## 12) Idempotency pattern

- Target: `backend/services/<service>/.../application/service/**`

```java
@Transactional
public NFeResult execute(EmitirNFeCommand cmd) {
    EmpresaContextHolder.require();
    if (idempotencyPort.exists(cmd.empresaId(), cmd.idempotencyKey()))
        return idempotencyPort.previousResult(cmd.empresaId(), cmd.idempotencyKey());
    idempotencyPort.register(cmd.empresaId(), cmd.idempotencyKey(), Instant.now());
    // ... process
}
```

- Notes: the idempotency key is composed of (empresaId, operationKey).

---

## 13) MapStruct Mapper

- Target: `backend/services/<service>/.../infrastructure/persistence/**`

```java
@Mapper(componentModel = "spring")
public interface ClienteMapper {
    Cliente toDomain(ClienteJpaEntity entity);
    ClienteJpaEntity toEntity(Cliente domain);
    ClienteResponseDto toDto(Cliente domain);
}
```

- Notes: use `componentModel = "spring"` for constructor injection. Add `annotationProcessor("org.mapstruct:mapstruct-processor:...")` to `build.gradle.kts`.

---

## 14) Controller (minimal)

- Target: `backend/services/<service>/.../api/controller/**`

```java
@RestController
@RequestMapping("/api/v1/clientes")
@RequiredArgsConstructor
class ClienteController {
    private final CriarClienteUseCase criarCliente;
    @PostMapping
    @PreAuthorize("hasAuthority('cad.cliente.write')")
    public ResponseEntity<ClienteResponseDto> create(@Valid @RequestBody CriarClienteRequestDto dto) {
        var result = criarCliente.execute(dto.toCommand());
        return ResponseEntity.status(HttpStatus.CREATED).body(ClienteResponseDto.from(result));
    }
}
```

---

## 15) GlobalExceptionHandler (ProblemDetail -- RFC 7807)

- Target: `backend/services/<service>/.../api/exception/**`

```java
@RestControllerAdvice
class GlobalExceptionHandler {

    @ExceptionHandler(BusinessException.class)
    ProblemDetail onBusiness(BusinessException e) {
        var pd = ProblemDetail.forStatusAndDetail(HttpStatus.UNPROCESSABLE_ENTITY, e.getMessage());
        pd.setProperty("errorCode", e.getErrorCode());
        pd.setProperty("empresaId", EmpresaContextHolder.get());
        return pd;
    }
    @ExceptionHandler(EntityNotFoundException.class)
    ProblemDetail onNotFound(EntityNotFoundException e) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, e.getMessage());
    }
}
```

---

## 16) Unit Test -- Application Service (mocked ports)

- Target: `backend/services/<service>/src/test/**`

```java
@Tag("unit")
@ExtendWith(MockitoExtension.class)
class CriarClienteServiceTest {
    @Mock ClientePort clientePort;
    @Mock ClienteDomainService domainService;
    @InjectMocks CriarClienteService svc;
    @BeforeEach
    void setUp() { EmpresaContextHolder.set("test"); }
    @AfterEach
    void tearDown() { EmpresaContextHolder.clear(); }
    @Test
    void shouldCreateCliente() {
        when(clientePort.save(any())).thenReturn(fakeCliente());
        var result = svc.execute(fakeCommand());
        assertThat(result).isNotNull();
        verify(clientePort).save(any());
    }
}
```

---

## 17) Integration Test -- Testcontainers (PostgreSQL, singleton pattern)

- Target: `backend/services/<service>/src/test/**`

> **IMPORTANT:** use a singleton container (static initializer), NEVER `@Testcontainers` + `@Container`
> -- it races with `@DynamicPropertySource`.

```java
@SpringBootTest
@ActiveProfiles("test")
public abstract class BaseIntegrationTest {

    static final PostgreSQLContainer<?> postgres;
    static {
        postgres = new PostgreSQLContainer<>("postgres:16-alpine")
                .withDatabaseName("cordele_test")
                .withUsername("test")
                .withPassword("test")
                .withInitScript("init-schema.sql");
        postgres.start();
    }
    @DynamicPropertySource
    static void overrideProps(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url", postgres::getJdbcUrl);
        r.add("spring.datasource.username", postgres::getUsername);
        r.add("spring.datasource.password", postgres::getPassword);
    }
}
```

- Notes: NEVER H2 for integration tests -- always Testcontainers with a real PostgreSQL.

---

## 18) WireMock Stub -- external service

```java
@RegisterExtension
static WireMockExtension wm = WireMockExtension.newInstance()
    .options(wireMockConfig().dynamicPort()).build();

wm.stubFor(post(urlEqualTo("/nfe/emitir"))
    .willReturn(aResponse().withStatus(200).withBody("<ok/>")));
```

---

## 19) ArchUnit Rule Sample

- Target: `backend/services/<service>/src/test/**`

```java
@AnalyzeClasses(packages = "@cordele.{module}")
class ArchitectureTest {
    @ArchTest
    static final ArchRule RULE_04_api_no_infrastructure =
        noClasses().that().resideInAPackage("..api..")
            .should().dependOnClassesThat().resideInAPackage("..infrastructure..");
    @ArchTest
    static final ArchRule RULE_01_domain_no_spring =
        noClasses().that().resideInAPackage("..domain..")
            .should().dependOnClassesThat().resideInAPackage("org.springframework..");
    @ArchTest
    static final ArchRule RULE_09_pacote_base =
        classes().should().resideInAPackage("@cordele..");
}
```

---

## 20) Gradle `build.gradle.kts` -- dependencies and the ArchUnit task

```kotlin
dependencies {
    // ArchUnit
    testImplementation("com.tngtech.archunit:archunit-junit5:1.3.0")
    // Cucumber BDD
    testImplementation("io.cucumber:cucumber-junit-platform-engine:7.18.0")
    testImplementation("io.cucumber:cucumber-java:7.18.0")
    testImplementation("io.cucumber:cucumber-spring:7.18.0")
    // Testcontainers
    testImplementation("org.testcontainers:postgresql:1.20.0")
    // WireMock
    testImplementation("org.wiremock:wiremock-standalone:3.9.1")
    // Embedded Artemis broker for JMS in tests
    testImplementation("org.apache.activemq:artemis-jakarta-server")
    // MapStruct processor
    annotationProcessor("org.mapstruct:mapstruct-processor:1.6.0")
    implementation("org.mapstruct:mapstruct:1.6.0")
}

tasks.register("architectureCheck") { dependsOn(tasks.named("test")) }
```

> **IMPORTANT:** never use `org.testcontainers:activemq` (it does not exist for Artemis).
> Use `org.apache.activemq:artemis-jakarta-server` with `spring.artemis.mode=embedded`.

---

## 21) DomainServiceConfig (mandatory)

- Target: `backend/services/<service>/.../infrastructure/config/**`

Domain services are plain POJOs (RULE-01: no Spring imports). They MUST be registered through a `@Configuration`:

```java
// infrastructure/config/DomainServiceConfig.java
@Configuration
public class DomainServiceConfig {
    @Bean
    public ClienteDomainService clienteDomainService() {
        return new ClienteDomainService();
    }
    @Bean
    public OrcamentoDomainService orcamentoDomainService() {
        return new OrcamentoDomainService();
    }
}
```

- Notes: one bean method per domain service. If the domain service takes parameters (other domain services), wire them here.

---

## 22) TestSecurityConfig -- mock JwtDecoder

- Target: `backend/services/<service>/src/test/**/config/**`

```java
@Configuration
@Profile("test")
public class TestSecurityConfig {
    @Bean
    public JwtDecoder jwtDecoder() {
        return token -> Jwt.withTokenValue(token)
                .header("alg", "none")
                .claim("sub", "test-user")
                .claim("empresa_id", "test")
                .issuedAt(Instant.now())
                .expiresAt(Instant.now().plusSeconds(3600))
                .build();
    }
}
```

- Notes: it stops Spring from reaching the real OIDC issuer during tests.

---

## 23) `application-test.yml` -- comprehensive test configuration

- Target: `backend/services/<service>/src/test/resources/**`

```yaml
# Profile 'test' -- Testcontainers provides the real DB.
# Datasource properties are overridden through @DynamicPropertySource.
spring:
  jpa:
    hibernate:
      ddl-auto: create-drop
    database-platform: org.hibernate.dialect.PostgreSQLDialect
    properties:
      hibernate:
        default_schema: cordele_global
  flyway:
    enabled: false
  artemis:
    mode: embedded
  security:
    oauth2:
      resourceserver:
        jwt:
          issuer-uri:
  cloud:
    discovery:
      client:
        simple:
          instances:
            iam-service:
              - uri: http://localhost:19999
            cadastros-service:
              - uri: http://localhost:19999
            comercial-service:
              - uri: http://localhost:19999
            fiscal-service:
              - uri: http://localhost:19999
            financeiro-service:
              - uri: http://localhost:19999
            estoque-service:
              - uri: http://localhost:19999
            crm-service:
              - uri: http://localhost:19999
            logistica-service:
              - uri: http://localhost:19999
            auditoria-service:
              - uri: http://localhost:19999

eureka:
  client:
    enabled: false
```

- Notes: override the datasource in `@DynamicPropertySource`. `simple.instances` provides dummy URLs for the Feign clients when Eureka is disabled.

---

## 24) `init-schema.sql` -- test schema initialization

- Target: `backend/services/<service>/src/test/resources/**`

```sql
-- Test schema initialization
CREATE SCHEMA IF NOT EXISTS cordele_global;
CREATE SCHEMA IF NOT EXISTS test;
```

- Notes: required because JPA entities use `@Table(schema = "cordele_global")` or
  `@Table(schema = "emp_<empresa>")` while the Testcontainers PostgreSQL only has `public` by default.
  Referenced through `.withInitScript("init-schema.sql")` in `BaseIntegrationTest`.

---

## 25) JPA Entity -- UUID assigned in the domain (canonical)

```java
// ✅ CORRECT
@Entity @Table(name = "cliente")
@Getter @Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor @Builder
public class ClienteJpaEntity {
    @Id private UUID id;
    @Version private Long version;   // nullable, no @Builder.Default
    // ...
}

// ❌ WRONG -- the 3 permutations below produce CREATE failures
@Id @UuidGenerator  // conflict 1: pre-set UUID + generator = "detached"
@Version private Long version;

implements Persistable<UUID> {       // conflict 2: Persistable + @Version
    @Builder.Default boolean isNew = true;
}

// toEntity()...
.builder().id(r.id()).version(0L).build()  // conflict 3: "detached entity passed to persist"
```

- Refs: `hexagonal-patterns.md` §4b (canonical rule).

---

## CI Recommendations

- ArchUnit in the test deps → blocking `architectureCheck`.
- Testcontainers for every integration job (PostgreSQL + embedded Artemis).
- WireMock for external HTTP stubs in integration and BDD.
- MapStruct processor in `annotationProcessor`.

## PR Checklist

- [ ] Ports in `application/port/out` or `application/port/in`.
- [ ] Adapters in `infrastructure/persistence/adapter` or `infrastructure/clients`.
- [ ] No `@Transactional` in controllers or adapters.
- [ ] DTOs used for the API; entities never returned directly.
- [ ] `EmpresaContextHolder.require()` called in application services.
- [ ] ArchUnit tests green (`./gradlew :<service>:architectureCheck`).
- [ ] Integration tests use Testcontainers (not H2).
- [ ] Embedded Artemis in tests, not Testcontainers Artemis.
- [ ] Base package `@cordele.<module>` (RULE-09).

## References

- `hexagonal-patterns.md` -- full rationale
- `platform-patterns.md` -- JMS envelope, Feign, multi-schema
- `testing-conventions.md` -- full pyramid
- `services-catalog.md` -- microservice catalog
