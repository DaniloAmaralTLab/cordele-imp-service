# Modelo de RBAC — Cordelê

> Papéis, scopes OAuth2 e contrato de JWT do Cordelê, **derivados do código real**
> dos quatro serviços (`imp`, `comp`, `pub`, `proj`) e das specs por serviço.
>
> Público-alvo: quem vai (a) configurar o realm do Keycloak e (b) implementar/alterar
> guards de autorização.
>
> **Regra deste documento:** só descreve o que existe no código ou está fechado em
> spec. Tudo que é proposta ou decisão pendente está marcado como tal — em §7 e nas
> linhas com `PROPOSTO` / `NÃO IMPLEMENTADO`.

---

## Quando usar este arquivo

- Criar/ajustar client scopes, roles e protocol mappers no realm do Keycloak.
- Implementar ou revisar `JwtAuthGuard` / `@RequiredScopes` num serviço.
- Mapear uma permission key do frontend (`AccessDecisionService.can()`) para um scope BE.
- Entender como `empresa_id` chega ao `search_path` do Postgres.

---

## 1. O que o Cordelê é (e o que isso implica para o RBAC)

O Cordelê transforma manuscritos em ePub. O fluxo operacional é linear:

```
IMP (importar manuscrito, revisar estrutura)
  → COMP (metadados, capa, layout)
    → PUB (gerar/validar/baixar o ePub)
      ↕ PROJ (projeto editorial: ciclo de vida, biblioteca, histórico, erasure LGPD)
```

Duas consequências diretas:

1. **Não há segregação funcional forte entre etapas.** Quem importa é, na prática, quem
   compõe e quem publica — a persona declarada em `arch/decisions/rbac.arch.json` é uma
   só (`COORDENADORA_EDITORIAL`, "Marina, coordenadora editorial em editora independente
   com 20–80 títulos/ano"). O conjunto mínimo de papéis é pequeno de propósito.
2. **A autorização é feita por scope OAuth2, não por papel.** Nenhum controller consulta
   papel. O único papel lido em código é `empresa-admin`, e só para o override de empresa
   (§5). Papéis existem para **agrupar scopes no Keycloak** — é o Keycloak quem traduz
   papel → scopes no token.

---

## 2. Scopes — o vocabulário real de autorização

Estes são **os scopes efetivamente exigidos por `@RequiredScopes` no código hoje**:

| Serviço | Scope | Onde é exigido |
|---|---|---|
| `imp-service` | `imp:read` | `GET manuscripts/:id`, `GET manuscripts/:id/estrutura`, `GET manuscripts/:id/segmentos/ignored` |
| `comp-service` | `comp:read` | `GET metadados`, `GET layout`, `GET preview-context` |
| `comp-service` | `comp:write` | `PUT metadados`, `POST capa`, `DELETE capa`, `PUT layout` |
| `pub-service` | `pub:read` | `GET .../status`, `GET publicacoes`, `GET .../download`, `GET .../stats`, `GET .../validation-messages` |
| `pub-service` | `pub:write` | `POST projetos/:projetoId/publicacoes` |
| `proj-service` | `proj:read` | `GET projetos`, `GET projetos/:id`, `GET .../publicacoes`, `GET .../download` |
| `proj-service` | `proj:write` | `POST projetos`, `POST .../reopen`, `POST .../advance-status` |
| `proj-service` | `proj:delete` | `DELETE projetos/:projetoId` (erasure LGPD — scope privilegiado, PROJ-014) |

**`imp:write` não existe em nenhum ponto do código.** Ele está declarado na spec
(`imp-service/contracts/api-contract.md` §2 e §4.1, `SPEC-06-security.md`) e no mapa de
permissões do frontend (`imp.import` → `imp:write`), mas nenhum handler o exige. Ver §6.

### Semântica do guard

- `@RequiredScopes(a, b)` = **OR** (`required.some(...)`), não AND.
- Handler **sem** `@RequiredScopes` = qualquer principal autenticado passa (o guard faz
  no-op quando não há metadata).
- Sem token / token expirado → **401**. Token válido sem o scope → **403**.
- Recurso de outra empresa → **404** por spec (evita enumeração cross-tenant), não 403.

---

## 3. Papéis do Cordelê

Conjunto mínimo. Um papel só entra aqui se cobre um fluxo que existe.

| Papel (realm role) | Status | Para quem | Racional |
|---|---|---|---|
| `empresa-admin` | **EM CÓDIGO** | Administração da editora / suporte da plataforma | Único papel lido em código: habilita o override de empresa via `X-Tenant-Id` (§5). Nos quatro serviços. |
| `coordenadora-editorial` | **PROPOSTO** | Marina — a persona operacional declarada | É o único papel de negócio declarado em `arch/decisions/rbac.arch.json` (code canônico `COORDENADORA_EDITORIAL`). Cobre o fluxo inteiro importar → compor → publicar → gerir projetos. |
| `leitor-editorial` | **PROPOSTO** | Acompanhamento sem direito de alteração (revisão externa, autor, direção) | Read-only. Cobre a necessidade real de "ver o andamento e baixar o ePub" sem poder alterar nada. |

Nenhum outro papel é proposto. Papéis por etapa do pipeline (um "importador", um
"diagramador", um "publicador") **não** são recomendados: nenhum controller distingue
etapas por papel, e a persona declarada faz o ciclo inteiro. Se a segregação for pedida
por negócio, ela é implementável só com os scopes da §2 — sem mudança de código.

> `COORDENADORA_EDITORIAL` é o code canônico em `arch/decisions/rbac.arch.json` e em
> `papeis.md`. O nome do **realm role** no Keycloak é proposto aqui em kebab-case para
> ficar consistente com `empresa-admin`, que já existe em código. Escolher um dos dois
> formatos e padronizar é decisão pendente (§7).

---

## 4. Matriz papel × scope

Diretamente traduzível para client scopes do Keycloak: cada célula ✓ é um client scope
default associado ao role.

| Scope | `empresa-admin` | `coordenadora-editorial` | `leitor-editorial` |
|---|:--:|:--:|:--:|
| `imp:read` | ✓ | ✓ | ✓ |
| `comp:read` | ✓ | ✓ | ✓ |
| `comp:write` | ✓ | ✓ | — |
| `pub:read` | ✓ | ✓ | ✓ |
| `pub:write` | ✓ | ✓ | — |
| `proj:read` | ✓ | ✓ | ✓ |
| `proj:write` | ✓ | ✓ | — |
| `proj:delete` | ✓ | — | — |
| `imp:write` *(não existe em código — §6)* | ✓ | ✓ | — |

Notas de leitura:

- **`proj:delete` só no `empresa-admin`.** É o scope de erasure LGPD (`DELETE /projetos/:id`,
  cascata para IMP/COMP/PUB via adapters de erasure). PROJ-014 o classifica como
  privilegiado. Se a coordenadora precisar apagar os próprios projetos, isso é uma decisão
  de negócio a tomar explicitamente (§7) — não um default.
- **`leitor-editorial` recebe `pub:read`**, o que inclui o download do ePub gerado
  (`GET .../publicacoes/:id/download`). Se o download precisar ser mais restrito que a
  leitura de status, é preciso um scope novo — hoje ambos caem em `pub:read`.
- A linha `imp:write` está na matriz porque o frontend **já** a consome (`imp.import` e
  `imp.confirm` no `imp.permission-map.ts`): sem ela no token, os botões de importar e
  confirmar ficam escondidos na UI, mesmo que o backend hoje aceite a chamada.

### Mapa de permission keys do frontend

O FE nunca testa papel — testa permission key via `AccessDecisionService.can()`, que
resolve para um scope do JWT (`access-layer-contracts.md`).

| Permission key (FE) | Scope BE | Registrada em |
|---|---|---|
| `imp.import` | `imp:write` | `frontend/libs/imp/shell-entry/src/lib/imp.permission-map.ts` |
| `imp.review` | `imp:read` | idem |
| `imp.confirm` | `imp:write` | idem |
| `comp.view` | `comp:read` | `frontend/libs/comp/data-access/src/lib/comp.constants.ts` |
| `comp.edit` | `comp:write` | idem |
| `pub.view` | `pub:read` | `frontend/libs/pub/shell-entry/src/lib/pub.contract.ts` |
| `pub.export` | `pub:write` | idem |
| `pub.download` | `pub:read` | idem |

O módulo PROJ **não tem permission map no frontend** — não há registro de `beScope` em
`frontend/libs/proj`. Gap conhecido (§7).

---

## 5. Contrato do JWT

Implementação idêntica nos quatro serviços: `<service>/src/infrastructure/auth/jwt.strategy.ts`.

### Validação do token

| Parâmetro | Valor |
|---|---|
| Algoritmo | `RS256` (fixo, sem fallback) |
| Chaves | JWKS em `${JWT_ISSUER_URI}/protocol/openid-connect/certs`, com cache e rate limit (10 req/min) |
| Issuer | `JWT_ISSUER_URI` — `getOrThrow`, o serviço **não sobe** sem ele |
| Audience | `JWT_AUDIENCE`, **por serviço** |
| Expiração | validada (`ignoreExpiration: false`) |

Valores de audience em `.env.example` de cada serviço:

| Serviço | `JWT_AUDIENCE` |
|---|---|
| `imp-service` | `imp-service` |
| `comp-service` | `comp-service` |
| `pub-service` | `pub-service` |
| `proj-service` | `proj-service` |

> ⚠️ O código tem um fallback `?? 'cordele'` quando `JWT_AUDIENCE` não está setado. Não
> confie nele: sem a variável no ambiente, os quatro serviços passam a aceitar a mesma
> audience genérica e o isolamento por serviço evapora. Sete `JWT_AUDIENCE` explicitamente
> em todo ambiente.
>
> Consequência para o realm: o token precisa carregar **`aud` com o serviço-alvo**. Na
> prática isso significa um client scope com *Audience mapper* por serviço, ou um token
> por serviço. Um único token com `aud: cordele` só funciona se todos os serviços forem
> configurados com esse valor — o que anula a separação. Decisão pendente (§7).

### Claims consumidos

| Claim | Tipo | Vira | Comportamento se ausente |
|---|---|---|---|
| `sub` | string | `user.userId` | **401** — `Token has no subject claim` |
| `preferred_username` | string | `user.username` | cai para `email`, depois para `sub` |
| `email` | string | `user.username` (fallback) | — |
| `scope` | string separada por espaço | `user.scopes: string[]` | vira `[]` → todo handler com `@RequiredScopes` responde 403 |
| `realm_access.roles` | string[] | `user.roles: string[]` | vira `[]` → sem `empresa-admin`, sem override de empresa |
| `empresa_id` | string | `user.empresaId` | vira `''` → **403** `Token carries no empresa claim` no guard |

### `empresa_id` é claim customizado

Não é um claim padrão do OIDC. **Exige um protocol mapper no Keycloak** (User Attribute
mapper: atributo `empresa_id` do usuário → claim `empresa_id`, com "Add to access token"
ligado). Sem ele, o token é assinado e válido, passa na strategy — e **toda** requisição
falha com 403 no guard. Este é o modo de falha mais provável ao montar o realm pela
primeira vez.

Note também que o `EmpresaContextMiddleware` (roda **antes** dos guards) faz um decode
não-verificado do payload só para popular o `AsyncLocalStorage`; a validação de assinatura
continua sendo do guard, que roda depois. Um token forjado não passa.

---

## 6. Multi-empresa e o papel do `empresa-admin`

O Cordelê é multi-**empresa** — unidades conhecidas do mesmo grupo econômico, não SaaS
multi-tenant. Isolamento por schema no Postgres (ADR-001, `multi-empresa.md`):

| Schema | Conteúdo |
|---|---|
| `cordele_global` | Usuários, RBAC, catálogos compartilhados |
| `emp_aetos` | Operacional — Editora Aetós |

**Hoje existe uma empresa.** O modelo suporta N, mas nada no repositório provisiona uma
segunda.

### Caminho do `empresa_id` até o `search_path`

```
JWT.empresa_id
  → JwtStrategy.validate()          → user.empresaId
    → JwtAuthGuard.resolveTenant()  → aplica (ou rejeita) o override X-Tenant-Id
      → EmpresaContext (AsyncLocalStorage / interceptor pós-auth)
        → PrismaEmpresaService      → SET search_path = emp_<slug>
```

### Override de empresa — a única regra de papel em código

`resolveTenant()`, presente nos quatro guards
(`imp-service/src/infrastructure/auth/jwt-auth.guard.ts:131` e equivalentes em comp, pub e proj):

```
header X-Tenant-Id ausente, ou igual ao empresa_id do token → segue com o do token
header X-Tenant-Id diferente + papel empresa-admin          → empresaId passa a ser o do header
header X-Tenant-Id diferente + sem empresa-admin            → 403
empresa_id vazio no token                                   → 403
```

`X-Tenant-Id` está no CORS `allowedHeaders` e documentado no Swagger dos quatro serviços.
É um mecanismo de **override administrativo/suporte**, não o caminho normal do usuário:
o caminho normal é o claim.

> O frontend envia `X-Empresa-Id` em chamadas server-to-server do `proj-service` para os
> demais serviços (adapters de read e de erasure). Nome de header **diferente** do
> `X-Tenant-Id` lido pelos guards. Divergência a resolver (§7).

---

## 7. Gap de autorização no `imp-service`

**Confirmado no código.** No `imp-service`, apenas os três GETs de leitura declaram
`@RequiredScopes('imp:read')`. Os demais cinco handlers **não declaram scope algum** — e,
como o guard faz no-op sem metadata, qualquer principal autenticado (qualquer token válido
com `sub` e `empresa_id`, independentemente de papel ou de scope) executa escritas no IMP.

Arquivo: `backend/services/imp-service/src/modules/imp/imp.controller.ts`.

| Linha | Handler | Scope hoje | Spec exige | Proposta |
|---|---|---|---|---|
| 55 | `POST manuscripts` (upload + parse) | **nenhum** | `imp:write` (api-contract §4.1) | `@RequiredScopes('imp:write')` |
| 77 | `GET manuscripts/:id` | `imp:read` | `imp:read` | ok |
| 93 | `GET manuscripts/:id/estrutura` | `imp:read` | `imp:read` | ok |
| 108 | `GET projetos/:projetoId/manuscritos` | **nenhum** | `imp:read` (api-contract §4.4) | `@RequiredScopes('imp:read')` |
| 122 | `POST manuscripts/:id/segmentos/:segId/ignore` | **nenhum** | — (addendum §8.1 não fecha scope) | `@RequiredScopes('imp:write')` |
| 138 | `DELETE manuscripts/:id/segmentos/:segId/ignore` | **nenhum** | — (idem) | `@RequiredScopes('imp:write')` |
| 155 | `GET manuscripts/:id/segmentos/ignored` | `imp:read` | `imp:read` (addendum §8.1) | ok |
| 171 | `POST manuscripts/:id/confirm-estrutura` | **nenhum** | — (addendum §8.2 não fecha scope) | `@RequiredScopes('imp:write')` |

Observações que reforçam que isto é **omissão, não decisão**:

- O próprio JSDoc do decorator em `imp-service/src/infrastructure/auth/jwt-auth.guard.ts`
  usa `@RequiredScopes('imp:write')` sobre `@Post('manuscripts')` como exemplo.
- A issue IMP-017 pede explicitamente "scope enforcement (`imp:write` / `imp:read`)".
- O `imp.permission-map.ts` do frontend já mapeia `imp.import` e `imp.confirm` para
  `imp:write` — a UI se comporta como se o scope existisse.
- Os outros três serviços não têm o problema: COMP e PUB têm `:write` em todas as escritas,
  PROJ tem `:write` e `:delete`.

**Correção proposta (não aplicada — mudança de autorização exige aprovação explícita):**

1. Criar o scope `imp:write` no realm (client scope, com o mesmo *Audience mapper* de
   `imp-service`).
2. Anotar os cinco handlers conforme a coluna "Proposta" acima.
3. Fechar em `api-contract.md` §8.1/§8.2 os scopes dos endpoints do addendum T04, que a
   spec deixou em aberto.
4. Distribuir `imp:write` conforme §4 (`empresa-admin` e `coordenadora-editorial`).

**Risco de aplicar:** um token que hoje escreve no IMP sem `imp:write` passa a receber 403.
Qualquer cliente ou script existente precisa do scope antes do deploy — a ordem correta é
realm primeiro, código depois.

---

## 8. O que ainda não existe

Explicitamente **não implementado** no repositório. Nada abaixo deve ser tratado como
comportamento disponível.

| Item | Situação |
|---|---|
| Serviço de IAM / `iam-service` | **Não existe.** Não há `POST /api/v1/iam/sessao/login`, `.../trocar-empresa`, `.../restore`, `.../logout` nem `POST /api/v1/iam/access/evaluate` em lugar nenhum do código. A versão anterior deste documento os descrevia como existentes. |
| Troca de empresa em runtime | **Não existe endpoint.** A empresa vem do claim; a única troca possível é o override `X-Tenant-Id` restrito a `empresa-admin` (§6). |
| Tabelas RBAC (`papel`, `permissao`, `papel_permissao`, `usuario`, `usuario_empresa`) | **Não existem em nenhuma migration.** Nenhum `.sql` ou `.prisma` do repositório as cria. A autorização hoje é inteiramente Keycloak → claims do JWT. |
| `modelo_acesso_versao` / erro `SESSION_VERSION_STALE` | **Não existe.** Nenhum serviço lê versão de modelo de acesso. |
| Permissões `<modulo>.<recurso>.<acao>` | **Não existem no backend.** O vocabulário real são os 8 scopes da §2. Permission keys existem só no FE, e resolvem para scopes. |
| Cache Redis de sessão / AccessDecision | **Não implementado.** |
| Permission map do PROJ no frontend | **Não existe** (`frontend/libs/proj` não registra `beScope`). |
| `X-Tenant-Id` vs `X-Empresa-Id` | **Divergência real:** guards leem `x-tenant-id`; adapters do `proj-service` enviam `X-Empresa-Id`. |
| Segunda empresa | Modelo suporta; **nenhuma provisionada**. |
| Segregação de papéis por etapa do pipeline | **Decisão pendente.** Implementável só com scopes, sem código novo. |
| `proj:delete` para a coordenadora | **Decisão pendente** (§4). |
| Formato do nome de role (`COORDENADORA_EDITORIAL` vs `coordenadora-editorial`) | **Decisão pendente** (§3). |
| Audience por serviço vs. audience única | **Decisão pendente** (§5). |

Os demais arquivos desta pasta (`papeis.md`, `permissoes.md`, `data-scope.md`,
`enforcement.md`, `session-policy.md`, `approval-workflow.md`) ainda descrevem, em parte
ou no todo, o modelo de ERP herdado do template — papéis de venda/fiscal/estoque, limites
de aprovação, `data_scope` por vendedor. **Não use nenhum deles como fonte de verdade sem
antes confrontar com o código.** Este arquivo é o único da pasta revisado contra a
implementação.

---

## 9. Erros a não cometer

- **Nunca** confie no fallback `JWT_AUDIENCE ?? 'cordele'` — sete a variável por serviço.
- **Nunca** derive a empresa de path, query ou body. Só do claim (ou do override
  `X-Tenant-Id` para `empresa-admin`).
- **Nunca** teste papel diretamente no controller ou no componente Angular. No BE, use
  `@RequiredScopes`; no FE, `AccessDecisionService.can(<permission-key>)`.
- **Nunca** adicione um handler de escrita sem `@RequiredScopes` — o guard faz no-op sem
  metadata e a rota fica aberta a qualquer autenticado (foi exatamente assim que o gap da
  §7 nasceu).
- **Nunca** responda 403 para recurso de outra empresa: a spec manda **404**, para não
  permitir enumeração cross-tenant.
- **Nunca** crie papel novo sem um scope que ele conceda e um fluxo que o use.

---

## Referências

- `docs/architecture/shared/multi-empresa.md` — ADR-001, schema-per-empresa
- `docs/architecture/frontend/standards/access-layer-contracts.md` — Access Layer do FE
- `docs/architecture/backend/services/imp-service/contracts/api-contract.md` §2, §4, §8
- `docs/architecture/backend/services/imp-service/spec/backend/SPEC-06-security.md`
- `docs/architecture/backend/services/comp-service/spec/backend/SPEC-06-security.md`
- `docs/architecture/backend/issues/IMP-017.md`, `COMP-013.md`, `PROJ-014.md`
- `arch/decisions/rbac.arch.json` — papéis canônicos declarados
- Código: `backend/services/*/src/infrastructure/auth/{jwt.strategy.ts,jwt-auth.guard.ts}`
