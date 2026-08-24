# Blueprint Core (Cordelê)

> Modelo mental canônico da plataforma Cordelê: **App único + módulos de negócio + shared assets**,
> governado por boundaries Nx (frontend) e arquitetura hexagonal (backend microserviços).

---

## Conceito central: Asset-Driven Delivery

- Cada entrega deveria virar um **asset reutilizável** (componente, padrão, SDK, contrato, cross-cutting).
- Módulos entregam valor de domínio; peças repetidas são promovidas a `frontend/libs/shared/*`
  ou `backend/services/<service>/` reusáveis.
- O `cordele-web` (FE) e o `cordele-api-gateway` (BE) hospedam concerns cross-cutting e
  definem padrões enforced.
- Monorepo + Nx (FE) + Gradle multi-project (BE) garantem evolução atômica e governance
  (dependency graph + affected CI).

---

## Camadas do blueprint

### Frontend (`frontend/`, Angular + Nx)

1. **App Shell (`apps/cordele-web`)**
   - Layout: Topbar / Sidebar / Content / RightPanel
   - Bootstrap flow (sessão / empresa-context / navegação)
   - Estados globais: loading / error / no-access
   - Route protection via guards (`authGuard`, `empresaGuard`, `accessGuard(<perm>)`)
   - NÃO contém lógica de decisão -- delega para Access Layer

2. **Módulo de Negócio (`libs/<modulo>/`)**
   - Entrypoint padrão por módulo: `<modulo>.routes.ts`, `<modulo>.providers.ts`
   - Metadata: permissões (`<modulo>.permission-map.ts`), feature flags (`<modulo>.feature-flags.ts`)
   - Integração com Shell via lazy loading e contratos (`@cordele/shared/contracts`)

3. **Access Layer (`libs/shared/access-*`)**
   - Sessão, empresa-context, permissions, decisão de acesso, derivação de navegação
   - Outputs deterministas: allow/deny/capabilities/menu nodes
   - Fachadas estáveis para Shell e módulos

4. **Shared UI / Design System (`libs/shared/ui-*`)**
   - Design tokens (`ui-tokens` -- migrar de `prototipo/tokens/pinus-tokens.css`)
   - Componentes base (Material-wrapped) + primitivos de layout
   - Estados padrão (empty/loading/error em `ui-feedback`) e patterns reusáveis

5. **Shared Infra / Data (`libs/shared/access-http-base`, `error-model`, etc.)**
   - HTTP base, interceptors (Correlation, X-Empresa-Id, ErrorNormalize)
   - SDKs tipados (`@cordele/shared/contracts` -- gerados a partir de OpenAPI dos serviços BE)
   - Observability e notificações como serviços cross-cutting

6. **Governança & Tooling**
   - Boundaries Nx enforced via ESLint (`nx-boundaries.md`)
   - Documentação e checks executáveis para prevenir architecture drift

### Backend (`backend/`, Java 21 microserviços)

1. **Gateway (`cordele-api-gateway`)** -- entry point único, JWT validation, roteamento, rate limit.
2. **Service Registry (`cordele-service-registry`)** -- Eureka.
3. **IAM (`<service>`)** -- auth (OIDC), usuários, papéis, EmpresaContext.
4. **Serviços de domínio (`<service>`, `<service>`, `<service>`,
   `<service>`, `<service>`, `<service>`, `<service>`)** -- regras de negócio.
5. **Auditoria (`<service>`)** -- trilha de eventos.
6. **Migrations (`cordele-migrations`)** -- Flyway centralizado, schema-per-empresa.

Cada microserviço segue arquitetura hexagonal estrita (`hexagonal-patterns.md`).

---

## Regras de ouro

- **Módulos não importam outros módulos** (FE: lib `scope:cad` não importa `scope:com`; BE: serviços só via Feign + JMS).
- **Shell (FE) e gateway (BE) possuem cross-cutting** -- módulos possuem domínio.
- **Shared libs / serviços compartilhados** são o único caminho aprovado de reuso.
- **Contracts-first:** integrar através de contratos tipados (OpenAPI) e fachadas estáveis.
- **"Se repete, promova"** (para shared).
- **Multi-empresa enforcement:** RULE-07 BE (`EmpresaContextHolder.require()`) + interceptor FE (`X-Empresa-Id`).

---

## Para que serve este documento

- Onboarding de novos contribuidores.
- Validação de decisões arquiteturais (a decisão respeita o blueprint?).
- Responder: "onde isso pertence?" e "quem é dono desta responsabilidade?".

---

## Referências

- `docs/architecture/shared/multi-empresa.md` -- ADR-001 schema-per-empresa
- `docs/architecture/frontend/standards/nx-boundaries.md` -- boundaries Nx
- `docs/architecture/frontend/standards/access-layer-contracts.md` -- contratos Access Layer
- `docs/architecture/backend/standards/hexagonal-patterns.md` -- hexagonal BE
- Memórias: `[[arquitetura-cordele-decidida]]`, `[[prototipo-canonico]]`
