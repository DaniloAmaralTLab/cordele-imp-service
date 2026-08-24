# Platform Patterns (Cordelê Backend)

> JMS Artemis, OpenFeign + Resilience4j, centralized Flyway, MDC/CorrelationId,
> multi-schema (empresa), Saga choreography, Eureka.

## Purpose

Cross-cutting patterns that every `backend/services/` microservice must implement.
They guarantee operational consistency, observability and resilience.

---

## 1. ActiveMQ Artemis -- JMS patterns

### 1.1 Broker and protocol

- Broker: **ActiveMQ Artemis** (not ActiveMQ Classic).
- Protocol: **AMQP 1.0** -- configure it in `application.yml`:

```yaml
spring:
  artemis:
    mode: native            # native for a dedicated broker; embedded for dev/tests
    broker-url: ${ARTEMIS_URL}
    user: ${ARTEMIS_USER}
    password: ${ARTEMIS_PASSWORD}
  jms:
    pub-sub-domain: false   # queues, not topics
```

In integration tests: use `mode: embedded` (NEVER `org.testcontainers:activemq`).

### 1.2 Event Envelope (mandatory)

Every published event must conform to this JSON envelope:

```java
// infrastructure/messaging/producer/EventEnvelope.java
public record EventEnvelope(
    String eventId,        // UUID v4 -- unique per occurrence
    String eventType,      // canonical name (e.g. "cordele.<module>.<entity>.<event>")
    String occurredAt,     // ISO 8601 UTC
    String correlationId,  // from the MDC -- cross-service trace
    String version,        // payload schema version (e.g. "1.0")
    String empresaId,      // always present on operational events
    String userId,         // when applicable
    Object payload         // event-specific data
) {}
```

**Usage:**
```java
public void publish(VendaConfirmadaPayload payload, String empresaId) {
    var envelope = new EventEnvelope(
        UUID.randomUUID().toString(),
        "cordele.<module>.<entity>.<event>",
        Instant.now().toString(),
        MDC.get("correlationId"),
        "1.0",
        empresaId,
        SecurityContextHolder.getContext().getAuthentication().getName(),
        payload
    );
    jms.convertAndSend("cordele.<module>.<entity>.<event>", envelope);
}
```

### 1.3 Producer Pattern

- Location: `infrastructure/messaging/producer/`
- Use a constructor-injected `JmsTemplate`.
- Never publish events directly from Application Services; delegate to a dedicated publisher.

```java
// infrastructure/messaging/producer/VendaConfirmadaPublisher.java
@Component
@RequiredArgsConstructor
@Slf4j
class VendaConfirmadaPublisher {
    private final JmsTemplate jms;
    public void publish(VendaConfirmadaEvent event) {
        log.info("publishing cordele.<module>.<entity>.<event> vendaId={} empresaId={}",
            event.vendaId(), event.empresaId());
        jms.convertAndSend("cordele.<module>.<entity>.<event>", event.toEnvelope());
    }
}
```

### 1.4 Consumer Pattern (idempotent)

- Location: `infrastructure/messaging/consumer/`
- Annotate with `@JmsListener(destination = "queue.name")`.
- The consumer must be idempotent -- check `processed` before acting.
- Set `EmpresaContextHolder` explicitly from the envelope (a ThreadLocal does not propagate cross-thread).
- Clear `EmpresaContextHolder` in `finally`.

```java
// infrastructure/messaging/consumer/VendaConfirmadaConsumer.java
@Component
@RequiredArgsConstructor
@Slf4j
class VendaConfirmadaConsumer {
    private final EmitirNFeUseCase emitirNFe;
    private final ProcessedEventPort processedEvents;
    @JmsListener(destination = "cordele.<module>.<entity>.<event>")
    public void onVendaConfirmada(EventEnvelope envelope) {
        if (processedEvents.alreadyProcessed(envelope.eventId())) {
            log.warn("duplicate event ignored eventId={}", envelope.eventId());
            return;
        }
        MDC.put("correlationId", envelope.correlationId());
        EmpresaContextHolder.set(envelope.empresaId());
        try {
            emitirNFe.execute(EmitirNFeCommand.from(envelope));
            processedEvents.markProcessed(envelope.eventId());
        } finally {
            EmpresaContextHolder.clear();
            MDC.clear();
        }
    }
}
```

### 1.5 Event Catalog

The canonical event catalog lives in `docs/architecture/backend/standards/services-catalog.md` §6.

---

## 2. OpenFeign -- Inter-service HTTP

### 2.1 Setup

- Enable it on the main class:
  `@EnableFeignClients(basePackages = "@cordele.<module>.infrastructure.clients")`
- Or per module through `@EnableFeignClients` on a `@Configuration` in `infrastructure/config/`.

### 2.2 Interface Pattern

- Location: `infrastructure/clients/` (RULE-06).
- Interface only -- Spring generates the implementation.
- Propagate `X-Correlation-Id`, `X-Empresa-Id`, `X-User-Id` through a `RequestInterceptor`.

```java
// infrastructure/clients/CadastrosClienteClient.java
@FeignClient(name = "<provider-service>")
public interface CadastrosClienteClient {
    @GetMapping("/api/v1/clientes/{id}")
    ClienteDto getById(
        @PathVariable UUID id,
        @RequestHeader("X-Empresa-Id") String empresaId);
}
```

### 2.3 RequestInterceptor -- context propagation

```java
// infrastructure/config/FeignContextInterceptor.java
@Component
class FeignContextInterceptor implements RequestInterceptor {
    @Override
    public void apply(RequestTemplate template) {
        template.header("X-Correlation-Id", MDC.get("correlationId"));
        template.header("X-Empresa-Id",     MDC.get("empresaId"));
        template.header("X-User-Id",        MDC.get("userId"));
    }
}
```

### 2.4 Resilience4j on Feign calls

- Apply it on the **Application Service** method that calls the Feign port -- not on the Feign interface.
- Configure it in `application.yml`:

```yaml
resilience4j:
  circuitbreaker:
    instances:
      <provider-service>:
        slidingWindowSize: 10
        failureRateThreshold: 50
        waitDurationInOpenState: 10s
  retry:
    instances:
      <provider-service>:
        maxAttempts: 2
        waitDuration: 200ms
  timelimiter:
    instances:
      <provider-service>:
        timeoutDuration: 2s
```

```java
@CircuitBreaker(name = "<provider-service>")
@Retry(name = "<provider-service>")
public Cliente buscarCliente(UUID id, String empresaId) {
    return cadastrosClienteClient.getById(id, empresaId);
}
```

---

## 3. Flyway -- Database Migrations (CENTRALIZED)

### 3.1 Strategy (decided in shared ADR-001)

- **`cordele-migrations`** is the only project that runs Flyway.
- Individual microservices only use `spring.jpa.hibernate.ddl-auto=validate`.
- Migrations never live in service projects -- always in `cordele-migrations/src/main/resources/db/migration/`.

### 3.2 Migration layout

```
backend/services/cordele-migrations/src/main/resources/db/migration/
├── global/                              # applied to cordele_global (once)
│   ├── V1__iam_schema.sql               # IAM (user, role, permission, ...)
│   ├── V2__catalogos_fiscais.sql        # NCM, CFOP, CST, ...
│   ├── V3__plano_contas_master.sql
│   └── V4__empresas_seed.sql            # registers the empresas
├── empresa/                             # applied to EVERY emp_*
│   ├── V1__cadastros.sql                # CAD: customer, supplier, product, ...
│   ├── V2__comercial.sql                # COM: quote, sale, ...
│   ├── V3__fiscal.sql                   # FIS: nfe, cte, ...
│   ├── V4__financeiro.sql               # FIN: cash, payable, ...
│   ├── V5__estoque.sql                  # EST: stock movement, ...
│   ├── V6__crm.sql                      # CRM: lead, opportunity, ...
│   ├── V7__logistica.sql                # LOG: delivery, freight, ...
│   └── V8__auditoria.sql                # AUD: event (optional, if each empresa keeps its own trail)
```

### 3.3 Configuration

`cordele-migrations/src/main/resources/application.yml`:
```yaml
spring:
  flyway:
    enabled: false           # driven manually from Java (multi-schema)

cordele:
  migrations:
    global-schema: cordele_global
    empresas:
      - <empresa-schema-1>
      - <empresa-schema-2>
      - <empresa-schema-3>
      - <empresa-schema-4>
      - <empresa-schema-5>
    global-location: classpath:db/migration/global
    empresa-location: classpath:db/migration/empresa
```

`MigrationsRunner.java`:
```java
@SpringBootApplication
public class CordelêMigrationsApp implements CommandLineRunner {

    @Autowired private DataSource ds;
    @Autowired private CordelêMigrationsConfig config;
    public static void main(String[] args) {
        SpringApplication.run(CordelêMigrationsApp.class, args);
    }
    @Override
    public void run(String... args) {
        // 1. Global
        migrate(config.globalSchema(), config.globalLocation());
        // 2. Each empresa
        for (String empresa : config.empresas()) {
            migrate(empresa, config.empresaLocation());
        }
    }
    private void migrate(String schema, String location) {
        log.info("Flyway migrate schema={}", schema);
        Flyway.configure()
            .dataSource(ds)
            .schemas(schema)
            .locations(location)
            .baselineOnMigrate(true)
            .load()
            .migrate();
    }
}
```

### 3.4 Rules

- Never modify a migration already applied in production.
- Idempotent scripts whenever possible (`IF NOT EXISTS`, `IF EXISTS`).
- To add a new empresa: add it to `cordele.migrations.empresas` and re-run
  `cordele-migrations` -- Flyway will apply every V to the new schema.
- `ddl-auto: validate` on ALL other services.

---

## 4. MDC and CorrelationId -- Observability

### 4.1 Mandatory MDC fields

Every service propagates these MDC fields on every request:

| MDC key | Source | Description |
|---|---|---|
| `correlationId` | `X-Correlation-Id` request header | Cross-service trace |
| `empresaId` | `X-Empresa-Id` request header | Empresa of the context |
| `userId` | `X-User-Id` request header | Acting user |
| `service` | static -- service name | Who produced the log |

### 4.2 CorrelationIdInterceptor (mandatory)

```java
// infrastructure/security/CorrelationIdInterceptor.java
@Component
public class CorrelationIdInterceptor implements HandlerInterceptor {

    @Value("${spring.application.name}")
    private String serviceName;
    @Override
    public boolean preHandle(HttpServletRequest req, HttpServletResponse res, Object handler) {
        String corrId = req.getHeader("X-Correlation-Id");
        if (corrId == null) corrId = UUID.randomUUID().toString();
        MDC.put("correlationId", corrId);
        MDC.put("empresaId",     req.getHeader("X-Empresa-Id"));
        MDC.put("userId",        req.getHeader("X-User-Id"));
        MDC.put("service",       serviceName);
        res.setHeader("X-Correlation-Id", corrId);    // echoed back to the caller
        return true;
    }
    @Override
    public void afterCompletion(HttpServletRequest req, HttpServletResponse res,
                                Object handler, Exception ex) {
        MDC.clear();
    }
}
```

Register it in `WebMvcConfigurer`:
```java
@Configuration
@RequiredArgsConstructor
public class WebConfig implements WebMvcConfigurer {
    private final CorrelationIdInterceptor correlationIdInterceptor;
    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(correlationIdInterceptor);
    }
}
```

### 4.3 Logging pattern

```yaml
logging:
  pattern:
    console: "%d{ISO8601} [%X{correlationId}] [%X{empresaId}] [%X{service}] %-5level %logger{36} - %msg%n"
  level:
    @cordele: INFO
    org.springframework.security: WARN
```

In production: `logstash-logback-encoder` for structured JSON.

---

## 5. Multi-Schema Tenancy (Empresa)

### 5.1 EmpresaContextHolder

See `hexagonal-patterns.md` §5 -- canonical code for `EmpresaContextHolder`.

### 5.2 Schema Routing (Hibernate)

Since the Cordelê schemas are **fixed** (1 global + 5 emp_*, not dynamic per customer),
the simplest approach is to set `search_path` per connection through a JDBC interceptor:

```java
// infrastructure/persistence/EmpresaSearchPathInterceptor.java
@Component
@RequiredArgsConstructor
class EmpresaSearchPathInterceptor {
    @PostConstruct
    void registerHikariCallback() {
        // Configure HikariCP setConnectionInitSql dynamically,
        // OR use AbstractRoutingDataSource with 1 datasource per schema.
    }
}
```

**Preferred alternative:** use the Hibernate `MultiTenantConnectionProvider` pointing at
a single DataSource and running `SET search_path TO emp_<empresa>, cordele_global, public`
at the start of each session.

```java
// infrastructure/persistence/EmpresaConnectionProvider.java
@Component
@RequiredArgsConstructor
class EmpresaConnectionProvider implements MultiTenantConnectionProvider {

    private final DataSource ds;
    @Override
    public Connection getConnection(Object tenantId) throws SQLException {
        Connection c = ds.getConnection();
        try (Statement s = c.createStatement()) {
            s.execute("SET search_path TO " + tenantId + ", cordele_global, public");
        }
        return c;
    }
    @Override
    public void releaseConnection(Object tenantId, Connection c) throws SQLException {
        try (Statement s = c.createStatement()) {
            s.execute("SET search_path TO DEFAULT");
        }
        c.close();
    }
    // ... other mandatory methods
}
```

And `CurrentTenantIdentifierResolver`:
```java
@Component
class EmpresaIdentifierResolver implements CurrentTenantIdentifierResolver<String> {
    @Override
    public String resolveCurrentTenantIdentifier() {
        return EmpresaContextHolder.require();
    }
    @Override
    public boolean validateExistingCurrentSessions() { return false; }
}
```

`application.yml`:
```yaml
spring:
  jpa:
    properties:
      hibernate:
        multiTenancy: SCHEMA
        tenant_identifier_resolver: @cordele.<module>.infrastructure.persistence.EmpresaIdentifierResolver
        multi_tenant_connection_provider: @cordele.<module>.infrastructure.persistence.EmpresaConnectionProvider
```

---

## 6. Saga Choreography (Onboarding a new Empresa)

A rare but important scenario: the customer decides to add a new empresa to the group.

### 6.1 Steps

```
1. iam-service publishes: cordele.empresa.created (with empresa_id, name, parameters)
2. cordele-migrations consumes: creates schema <new-empresa-schema> and runs every V (manually or via job)
3. <provider-service> consumes: imports the shared catalogs
4. fiscal-service consumes: registers the empresa in the SEFAZ config
5. financeiro-service consumes: creates the chart-of-accounts template
6. auditoria-service records: cordele.empresa.onboarding.completed
```

### 6.2 Compensation

- If any step fails after commit, publish a compensation event (`cordele.empresa.onboarding.failed`).
- Each consumer handles the compensation and its own idempotent local rollback.
- Never distributed transactions -- eventual consistency + idempotent consumers.

---

## 7. Eureka -- Service Discovery

### 7.1 Client registration (mandatory)

```yaml
eureka:
  client:
    service-url:
      defaultZone: ${EUREKA_URL:http://cordele-service-registry:8761/eureka/}
    register-with-eureka: true
    fetch-registry: true
  instance:
    prefer-ip-address: true
    instance-id: ${spring.application.name}:${random.value}
```

### 7.2 Feign resolution

With `@FeignClient(name = "service-name")`, Spring Cloud + Eureka resolve the instance
automatically. No hardcoded URLs in production.

For local dev without Eureka:
```yaml
# application-local.yml
eureka.client.enabled: false
spring.cloud.openfeign.client.config.<provider-service>.url: http://localhost:8082
```

---

## 8. Checklist (Platform Patterns -- new service)

- [ ] `CorrelationIdInterceptor` registered in `WebMvcConfigurer`
- [ ] `EmpresaContextHolder` under `infrastructure/security/`
- [ ] `EmpresaFilter` (`OncePerRequestFilter`) populates and clears the context per request
- [ ] Every JMS producer uses `EventEnvelope`
- [ ] Every JMS consumer sets `EmpresaContextHolder` from the envelope and clears it in `finally`
- [ ] Every JMS consumer is idempotent (`processedEventPort.alreadyProcessed`)
- [ ] Feign clients propagate `X-Correlation-Id`, `X-Empresa-Id`, `X-User-Id` through a `RequestInterceptor`
- [ ] Resilience4j CircuitBreaker + Retry applied at the application-service edge
- [ ] `spring.jpa.hibernate.ddl-auto: validate` in `application.yml`
- [ ] `spring.jpa.open-in-view: false` in `application.yml` (RULE-08)
- [ ] Hibernate `multiTenancy: SCHEMA` + `EmpresaIdentifierResolver` configured
- [ ] Eureka registration configured
- [ ] No own migration (delegated to `cordele-migrations`)

---

## References

- `hexagonal-patterns.md` -- `EmpresaContextHolder` and the cross-empresa guard
- `services-catalog.md` -- microservice and event catalog
- `rbac.md` -- RBAC model + JWT claims
- `docs/architecture/shared/multi-empresa.md` -- ADR-001
- `docs/architecture/shared/distributed-architecture.md` -- topology
