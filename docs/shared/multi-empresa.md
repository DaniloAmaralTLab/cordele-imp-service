# ADR-001 -- Multi-empresa via schema per tenant

**Status:** Aceito
**Decisores:** Arquiteto + AI agent (refinada via discovery ingestion)
**Substitui:** nenhum

> **Fonte de verdade das políticas:** `templates/architecture/decisions/multi-tenancy.arch.json` (D-063).
> Estratégias de isolamento, modos suportados e contrato de propagação são derivados do JSON.
> Valores per-projeto (modo escolhido, schemas) vêm de `project-context.json`.

---

## Contexto

Cordelê adota o modo **Multi-empresa (group)** (`multi-empresa`): Corporate multi-tenant: N known units of the same economic group share users, RBAC and master catalogues; only operational data differs per unit. Tenants are pre-registered and known at design time. For SaaS with unknown external clients (dynamic tenant discovery), use the `multi-tenant` mode instead.

Cada empresa tem dados estritamente isolados. A escolha de estratégia (`schema-per-tenant`) determina como o isolamento é realizado fisicamente no banco e como o contexto trafega na aplicação.

## Decisão

Adotar **schema per tenant** no Postgres:

Each empresa lives in its own Postgres schema; a global schema holds shared catalogues (users, roles, vocabulary, parameters). Hibernate switches search_path per connection via a custom MultiTenantConnectionProvider.

| Schema | Conteúdo |
|---|---|
| `cordele_global` | Usuários, papéis, permissões e catálogos compartilhados entre todas as empresas (parâmetros globais, vocabulário canônico, dados que NÃO variam por empresa) |
| `emp_aetos` | Operacional — Editora Aetós |

DDL canônico de cada schema operacional fica no `cordele-migrations` (Flyway/Liquibase). Migrations são aplicadas N+1 vezes: 1× no global + 1× em cada empresa.

### Propagação do contexto

**Síncrono (HTTP):**

1. JWT carrega `empresa_id` (selecionado no login ou via header `X-Empresa-Id` quando o usuário tem acesso a múltiplas empresas).
2. Filtro Spring Security (`EmpresaContextFilter`) lê o claim e popula `EmpresaContextHolder` (ThreadLocal + MDC chave `empresaId`).
3. `EmpresaContextHolder.require()` é chamado no início de cada `application.service` — enforced por ArchUnit `RULE-07`. Every application.service method MUST call holder.require() at entry, enforced by an ArchUnit rule. Forgetting it raises a compile-time test failure rather than a silent runtime leak.
4. `MultiTenantConnectionProvider` do Hibernate (SCHEMA strategy) executa `SET search_path TO <empresa-schema>, cordele_global, public` por conexão.

**Assíncrono (`@JmsListener`, threads de background):**

- ThreadLocal não propaga. O empresa id viaja como **header da mensagem JMS** (`empresaId`).
- Consumer lê o header, popula o `EmpresaContextHolder`, processa, faz `clear()` no `finally` (always_in_finally_block).
- ThreadLocal does not cross thread boundaries. The empresa id travels as a JMS message header; the consumer reads it, binds the holder, processes, and calls holder.clear() in a finally block. Failing to clear leaks state across thread-pool reuse — this is mandatory.
- Helper `EmpresaContextExecutor.runAs(empresaId, () -> ...)` para tarefas internas.

### RBAC × empresa

- Usuário pode ter acesso a **N empresas** (associação `usuario_empresa` no `cordele_global`).
- A cada login, frontend mostra seletor se N > 1; escolha persiste no JWT.
- Papéis (declarados em `arch/decisions/rbac.arch.json`) são definidos no global mas **escopados por empresa** na associação.
- Detalhes: `docs/architecture/shared/rbac/`.

## Consequências

**Positivas:**

- Strong isolation: backup, restore, retention and audit per empresa.
- Migrations applied N+1 times (1 global + N per empresa) — explicit and auditable.
- Cross-empresa reports use explicit UNION ALL across schemas — protects against accidental leak.
- Per-empresa dump/restore is trivial — useful for GDPR/LGPD right-to-erasure or moving a empresa to another instance.

**Negativas:**

- Cross-empresa queries require explicit code (no automatic JOIN).
- New empresa = new migration set (schema + every V*.sql) — automated but adds an operational step.
- DDL drift risk: all emp_* schemas must be on the same migration version. The migrations service is the single source of truth.

## Alternativas consideradas

As demais estratégias de isolamento declaradas em `multi-tenancy.arch.json`:

### Tenant-id column (`tenant-id-column`)

Single schema; every row carries a tenant_id column. Filter applied universally via Hibernate @Filter or query interceptor at the EntityManager level.

**Positivas:** Single schema simplifies migrations and backup operations.; Cross-empresa queries are trivial — just drop the filter where allowed.; Smaller infrastructure footprint.
**Negativas:** Risk of leak if the filter is forgotten in custom native queries.; Heavier indexes — every secondary index must include tenant_id to remain selective.; Single backup/restore — harder to operate per-empresa retention or GDPR-style erasure.

### Database per tenant (`database-per-tenant`)

Each empresa in a separate Postgres database, with its own connection pool. The application maintains N HikariCP DataSources and resolves which one to use per request.

**Positivas:** Strongest isolation — physical separation, easy to move a empresa to a different host.; Per-empresa resource limits possible at the DB level.
**Negativas:** N connection pools at runtime — memory + handshake cost scales linearly.; Complex local development (N databases to seed).; Higher infrastructure cost.; Schema migrations harder to orchestrate (must hit every DB).

### Single-tenant (`none`)

No tenant isolation — the application serves a single internal empresa. No tenant_id is propagated; the request context is empty of tenant data.

**Positivas:** Simplest model — no holder, no filter, no propagation.
**Negativas:** Cannot serve multiple tenants without a non-trivial refactor.

## Implementação

- Serviço de identidade: emite JWT com `empresa_id`, gerencia associação `usuario_empresa`.
- `cordele-migrations`: lê lista de empresas (env var ou tabela `cordele_global.empresa`) e roda migrations por schema.
- Cada microserviço BE: depende de `libs/shared/empresa-context` (módulo Gradle) que provê `EmpresaContextHolder`, `EmpresaContextFilter`, `MultiTenantConnectionProvider`, `JmsHeadersInterceptor`.
- Frontend: `@cordele/shared/empresa-context` provê o seletor de empresa + interceptor HTTP que adiciona `X-Empresa-Id` (redundante com JWT, ajuda em debug/log).

## Referências

- Hibernate multi-tenancy: https://docs.jboss.org/hibernate/orm/current/userguide/html_single/Hibernate_User_Guide.html#multitenacy
- ADRs originais do discovery (se aplicável): `_inbox/adr/` (preservadas verbatim pelo D-073 ingestion)
- Decisões formalizadas: `arch/decisions/multi-tenancy.arch.json` (D-063); cross-projeto + per-project overrides em `arch/overrides/` (D-074)
