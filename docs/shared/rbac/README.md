# RBAC — Modelo de Acesso (Backend + Frontend)

> Modelo de papéis (roles) × permissões (capabilities) × empresas. **Compartilhado entre BE e FE.**

## Documentos desta pasta

| Doc | Quando ler |
|---|---|
| [`modelo.md`](modelo.md) | Antes de implementar **qualquer** lógica de autorização (BE ou FE). Cobre papéis canônicos, schema SQL, AccessDecision, cache Redis, anti-patterns |
| [`papeis.md`](papeis.md) | Quando criar/popular sementes (V1 migration) — papéis canônicos com seus codes, descrições e permission bundles |
| [`permissoes.md`](permissoes.md) | Quando adicionar permissão nova num módulo — catálogo namespace `<modulo>.<recurso>.<acao>` |
| [`data-scope.md`](data-scope.md) | Antes de mexer em listagens/queries que diferem por papel (VENDEDOR vê só próprios, ALMOXARIFE vê só local). Cobre tipos de scope, cenários narrados, JSON do AccessDecision |
| [`enforcement.md`](enforcement.md) | Antes de implementar `application.service` com listagem. Decisão técnica (Hibernate Filter), exemplos de código BE + FE, alternativas rejeitadas |
| [`session-policy.md`](session-policy.md) | Antes de configurar IAM ou ajustar TTL de tokens. Tabela TTL/refresh/idle/MFA por papel + fluxo de refresh + invalidação por mudança de RBAC |
| [`approval-workflow.md`](approval-workflow.md) | Quando implementar ação que pode exceder limite operacional (Contas a Pagar > R$ 5k, venda com desconto > 10%, etc.). Tabela completa de regras + estado workflow_aprovacao |

## Princípio em uma frase

**RBAC é responsabilidade do `<service>`** (BE) e do `libs/shared/access-*` (FE). Nenhum outro
serviço/lib decide acesso por si — apenas **consulta** `AccessDecisionService` e age conforme.

## Quando esta pasta muda

- Adicionar/remover papel canônico → editar `papeis.md` + atualizar V1 migration em `cordele-migrations`.
- Adicionar permissão num módulo novo → editar `permissoes.md` (catálogo) + `<modulo>.permission-map.ts` (FE) + constante no `<modulo>-service` (BE).
- Mudança de modelo (ex.: introduzir custom roles, multi-SSO) → criar ADR + editar `modelo.md`.

## Referências cruzadas

- ADR-001 schema-per-empresa: [[../multi-empresa]]
- Schema `cordele_global` (onde vivem as tabelas RBAC): [[../modelo-dados/cordele-global]]
- Frontend Access Layer: [[../../frontend/standards/access-layer-contracts]]
- Backend hexagonal + guard de empresa: [[../../backend/standards/hexagonal-patterns]] §5
