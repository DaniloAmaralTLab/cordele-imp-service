# Distributed Architecture (Cordelê)

> Como Cordelê é "distribuído" entre app único Angular + N microserviços Java, com fronteiras estritas.

Goal: explicar a topologia frontend (Nx workspace com 1 app + libs por módulo) e backend
(microserviços Spring + Eureka) e suas fronteiras.

---

## Não é um "app de páginas"

Cordelê é **asset-driven**:
- **Frontend:** 1 app (`apps/cordele-web`) + N libs por módulo (`libs/<modulo>/{feature,data-access,ui,access}`) + shared (`libs/shared/*`).
- **Backend:** N microserviços Spring deployáveis independentemente, registrados em Eureka, integrados via Feign + JMS Artemis.
- Tudo evolui via dependency graph (Nx no FE, Gradle multi-project no BE).

---

## Topologia runtime -- Frontend

- **`cordele-web`** boota primeiro e permanece residente.
- **Módulos** são carregados via lazy routes: `/cad`, `/com`, `/fis`, `/fin`, `/est`, `/crm`, `/log`, `/iam`.
- **Shared libs** são carregadas conforme necessárias (importadas pelo app e pelos módulos).
- Cada lazy route segue: `loadComponent: () => import('@cordele/<modulo>/feature-<slug>').then(m => m.<Slug>PageComponent)`.

---

## Topologia runtime -- Backend

- **`cordele-service-registry`** (Eureka) sobe primeiro -- catálogo de serviços.
- **`cordele-api-gateway`** -- entry point único, valida JWT, roteia para serviços por path
  (`/api/cadastros/*` → `<service>`, etc.).
- **Serviços de domínio** (`<service>`, `<service>`, ...) -- expostos só via gateway.
- **JMS Artemis** -- comunicação assíncrona (eventos: `cadastro.cliente.criado`, `comercial.venda.confirmada`, etc.).
- **Postgres com schema-per-empresa** (`cordele_global` + `<empresa-schema-1>`, `<empresa-schema-2>`, ...) -- ver `multi-empresa.md`.

---

## Modelo de propriedade

### Frontend

| Camada | Responsabilidade |
|---|---|
| `apps/cordele-web` | Layout, bootstrap (sessão/empresa-context), base routing, estados globais de UX |
| `libs/<modulo>/feature-*` | Workflows do domínio do módulo |
| `libs/<modulo>/data-access` | ApiServices + Facades específicos do módulo |
| `libs/<modulo>/ui` | Componentes presentational específicos do módulo |
| `libs/<modulo>/access` | Permission map + feature flags do módulo |
| `libs/shared/*` | Componentes UI reusáveis, patterns, SDKs, infra utilities |
| `libs/shared/access-*` | Autorização determinística + derivação de navegação |

### Backend

| Camada | Responsabilidade |
|---|---|
| `cordele-api-gateway` | Entry point, JWT, roteamento, rate limit |
| `cordele-service-registry` | Eureka |
| `<service>` | Auth (OIDC), usuários, papéis, EmpresaContext |
| `<modulo>-service` | Lógica de domínio do módulo + persistência + eventos |
| `cordele-migrations` | Flyway centralizado, schema-per-empresa |
| `<service>` | Trilha de eventos (consumer passivo JMS) |

---

## Comunicação

### Frontend ↔ Backend

- FE → BE: via `@cordele/shared/access-http-base` (interceptor injeta `Authorization: Bearer <JWT>` + `X-Empresa-Id`).
- BE → FE: JSON (DTOs registrados em `@cordele/shared/contracts`, gerados via OpenAPI).
- WebSocket / SSE (futuro): canal de eventos para atualizações reativas.

### Backend ↔ Backend

- **Sincronizada:** Feign + Resilience4j (circuit breaker, retry, timeout).
- **Assíncrona:** JMS Artemis (eventos de domínio).
- Cada serviço NUNCA chama o banco de outro serviço diretamente.

### Cordelê-web → Módulos

- App → módulo: via contratos (`@cordele/shared/contracts/<modulo>-routes`) e lazy import.
- Módulo → módulo: **proibido**. Comunicação via API BE ou via `@cordele/shared/*`.

---

## Anti-patterns comuns (evitar)

- Decisão de permissão dentro de componente de módulo (sempre via `AccessDecisionService`).
- Interceptors HTTP duplicados por módulo (usar só `@cordele/shared/access-http-base`).
- Importar código de outro módulo (Nx boundary bloqueia, mas avise antes do PR).
- Barrels gigantes que quebram lazy loading e inflam bundle do `cordele-web`.
- Serviço BE acessando schema `emp_<empresa>` de outra empresa (RULE-07 bloqueia em runtime via `EmpresaContextHolder.require()`).
- "Endpoint helper" no gateway que mistura responsabilidades de dois serviços (gateway não orquestra, só roteia).

---

## Checks práticos para módulo novo

Um módulo novo de negócio deve:
- [ ] Carregar lazy (não inflar `cordele-web`)
- [ ] Depender apenas de `scope:<modulo>` + `scope:shared`
- [ ] Manter lógica de domínio dentro de suas fronteiras (`libs/<modulo>/*`)
- [ ] Expor APIs BE via `<modulo>-service` (NÃO via gateway helper)
- [ ] Registrar permission keys no `<modulo>.permission-map.ts`
- [ ] Consumir `EmpresaContextService` (FE) e respeitar RULE-07 (BE)
