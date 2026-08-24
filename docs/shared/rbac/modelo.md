# RBAC Model & Access Matrix (Cordelê)

> Modelo de papéis, permissões e decisão de acesso do Cordelê.
> Simples por design: grupo familiar de empresas, sem SaaS multi-cliente, sem multi-SSO.

## Quando usar este arquivo

- Implementar papéis, permissões ou lógica de avaliação de acesso.
- Trabalhar em guards/filters de autorização.
- Adicionar permission key nova num módulo.
- Implementar troca de empresa por usuário com acesso a múltiplas.

---

## 1. Papéis canônicos (Cordelê)

Cordelê tem **6 papéis padrão** (escopados por empresa via `usuario_empresa`):

| Role Code | Resumo | Escopo de dados |
|---|---|---|
| `ADMIN` | Controle total da empresa (config, RBAC, parâmetros) | Toda a empresa |
| `GERENTE` | Aprova orçamentos, fecha vendas, vê relatórios consolidados | Toda a empresa |
| `VENDEDOR` | Cria orçamentos, vendas, atende clientes; vê apenas seus próprios | Próprios documentos (data_scope = vendedor_id) |
| `FISCAL` | Emite/cancela NFe, gerencia matriz tributária | Toda a empresa (módulo FIS) |
| `FINANCEIRO` | Gerencia caixa, contas a pagar/receber, conciliação | Toda a empresa (módulo FIN) |
| `ALMOXARIFE` | Movimenta estoque, faz inventário, recebe NF | Toda a empresa (módulo EST) |

### Papéis adicionais (opcionais, conforme demanda)

| Role Code | Uso |
|---|---|
| `CRM_OPERADOR` | Opera funil/leads/pipeline; sem acesso a outros módulos | módulo CRM |
| `LOGISTICA_OPERADOR` | Cria entregas, atualiza status de frete | módulo LOG |
| `AUDITOR` | Read-only em toda a empresa; usado por contabilidade externa | Toda a empresa, somente leitura |

---

## 2. Multi-empresa e papéis

Cada usuário pode ter acesso a **N empresas** (associação `usuario_empresa`).

```
cordele_global.usuario_empresa (
    usuario_id    UUID NOT NULL,
    empresa_id    VARCHAR(50) NOT NULL,    -- ex.: <empresa-schema-1>
    papel         VARCHAR(50) NOT NULL,    -- ADMIN, GERENTE, ...
    ativo         BOOLEAN NOT NULL DEFAULT true,
    PRIMARY KEY (usuario_id, empresa_id)
)
```

No login:
- Se usuário tem 1 empresa: usa essa automaticamente, JWT carrega `empresa_id`.
- Se usuário tem N > 1: frontend mostra seletor; escolha persiste no JWT (`empresa_id` claim).
- Troca de empresa em runtime via `POST /api/v1/iam/sessao/trocar-empresa` -- emite novo JWT.

---

## 3. Permissões -- formato

Namespace: `<modulo>.<recurso>.<acao>`

Exemplos:
- `cad.cliente.read` / `cad.cliente.write` / `cad.cliente.delete`
- `com.orcamento.aprovar`
- `com.venda.criar`
- `fis.nfe.emitir` / `fis.nfe.cancelar`
- `fin.caixa.abrir` / `fin.caixa.fechar`
- `crm.lead.qualificar`

Cada módulo tem seu **permission-map** em `frontend/libs/<modulo>/access/src/lib/<modulo>.permission-map.ts`
e o backend equivalente em `<modulo>-service` (constante em `domain.security`).

---

## 4. Tabelas principais (`cordele_global`)

### Core RBAC

```sql
-- Papéis (sementes em V1 do cordele-migrations)
CREATE TABLE cordele_global.papel (
    papel_id      UUID PRIMARY KEY,
    codigo        VARCHAR(50) UNIQUE NOT NULL,    -- ADMIN, GERENTE, ...
    nome          VARCHAR(100) NOT NULL,
    descricao     TEXT,
    ativo         BOOLEAN NOT NULL DEFAULT true
);

-- Permissões (sementes em V1)
CREATE TABLE cordele_global.permissao (
    permissao_id  UUID PRIMARY KEY,
    codigo        VARCHAR(100) UNIQUE NOT NULL,   -- cad.cliente.read
    modulo        VARCHAR(10)  NOT NULL,          -- CAD, COM, FIS, ...
    nome          VARCHAR(150) NOT NULL,
    descricao     TEXT
);

-- Mapeamento papel ↔ permissão
CREATE TABLE cordele_global.papel_permissao (
    papel_id      UUID NOT NULL REFERENCES cordele_global.papel(papel_id),
    permissao_id  UUID NOT NULL REFERENCES cordele_global.permissao(permissao_id),
    PRIMARY KEY (papel_id, permissao_id)
);

-- Usuários
CREATE TABLE cordele_global.usuario (
    usuario_id    UUID PRIMARY KEY,
    email         VARCHAR(255) UNIQUE NOT NULL,
    nome          VARCHAR(150) NOT NULL,
    ativo         BOOLEAN NOT NULL DEFAULT true,
    criado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Associação usuário ↔ empresa (com papel)
CREATE TABLE cordele_global.usuario_empresa (
    usuario_id    UUID NOT NULL REFERENCES cordele_global.usuario(usuario_id),
    empresa_id    VARCHAR(50) NOT NULL,           -- <empresa-schema-1>, <empresa-schema-2>, ...
    papel         VARCHAR(50) NOT NULL,           -- codigo do papel
    data_scope    VARCHAR(50),                    -- opcional: vendedor_id se papel = VENDEDOR
    ativo         BOOLEAN NOT NULL DEFAULT true,
    PRIMARY KEY (usuario_id, empresa_id)
);
```

### Versão do modelo de acesso (para cache invalidation)

```sql
CREATE TABLE cordele_global.modelo_acesso_versao (
    id            INT PRIMARY KEY DEFAULT 1,
    versao        BIGINT NOT NULL DEFAULT 1,
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (id = 1)  -- singleton
);
```

Quando RBAC muda (novo papel, nova permissão, alteração em `papel_permissao`),
`UPDATE versao = versao + 1`. JWTs carregam `modelo_acesso_versao` claim;
se o backend detecta JWT com versão antiga, retorna `401 SESSION_VERSION_STALE`
e força refresh.

---

## 5. AccessDecision -- formato de retorno

```java
// Retorno de POST /api/v1/iam/access/evaluate
public record AccessDecisionResponse(
    UUID usuarioId,
    String empresaId,                    // <empresa-schema-1>, ...
    String papel,                        // ADMIN, GERENTE, VENDEDOR, ...
    List<String> permissoes,             // ["cad.cliente.read", "com.venda.criar"]
    String dataScope,                    // opcional: vendedor_id se VENDEDOR
    long modeloAcessoVersao,
    SessionPolicy sessionPolicy          // { accessTokenTtl, refreshTtl, idleTimeout }
) {}
```

---

## 6. Implementação

### <service>

- Endpoints:
  - `POST /api/v1/iam/sessao/login` -- OIDC callback do Keycloak; emite JWT.
  - `POST /api/v1/iam/sessao/trocar-empresa` -- usuário com N empresas troca empresa ativa; novo JWT.
  - `POST /api/v1/iam/access/evaluate` -- retorna `AccessDecisionResponse` (usado por gateway + serviços para cache).
  - `GET /api/v1/iam/sessao/restore` -- restaura sessão a partir do JWT em cookie httpOnly.
  - `POST /api/v1/iam/sessao/logout` -- invalida sessão (incrementa `modelo_acesso_versao` se preciso forçar).

### Demais serviços

- No filter de Security: lê JWT, popula `EmpresaContextHolder` com `empresa_id` claim.
- Antes de cada `application.service` operacional: chama `EmpresaContextHolder.require()` (RULE-07).
- Para checks de permissão:
  ```java
  @PreAuthorize("hasAuthority('cad.cliente.write')")
  public ClienteResponse criar(CriarClienteRequest req) { ... }
  ```
  ou checagem programática:
  ```java
  if (!authoritiesContainsAny("cad.cliente.write", "cad.cliente.delete")) {
      throw new ForbiddenException("missing.permission");
  }
  ```

---

## 7. Redis cache (otimização)

O Cordelê usa **Redis** (ou Valkey) para 3 casos de cache:

### Session cache
```
Key:    cordele:sessao:{sessionId}
Value:  {versao, usuarioId, empresaId, papel, expiresAt}
TTL:    mesmo do access token (15 min default)
```

### AccessDecision cache
```
Key:    cordele:access:{usuarioId}:{empresaId}
Value:  AccessDecisionResponse serializado
TTL:    5 min (curto -- invalida via pub/sub)
Invalidação: evento `cordele.modelo.acesso.alterado` publica em "cordele:access:invalidate"
```

### Rate limiting (gateway)
```
Key:    cordele:rate:{empresaId}:{windowTimestamp}
Value:  contador atomico (INCR)
TTL:    60s (janela de 1 minuto)
```

### Config sugerida (`application.yml`)

```yaml
spring:
  data:
    redis:
      host: ${REDIS_HOST:localhost}
      port: ${REDIS_PORT:6379}
      password: ${REDIS_PASSWORD:}
      timeout: 2000ms

cordele:
  cache:
    sessao:
      ttl: 15m
      prefix: "cordele:sessao:"
    access-decision:
      ttl: 5m
      prefix: "cordele:access:"
  rate-limiting:
    default-rate: 100
    burst: 20
    key-prefix: "cordele:rate:"
```

### Regra de ouro
**Redis é otimização, não source of truth.** Se Redis cair, cada serviço vai direto no
PostgreSQL (mais lento, mas funcional). O banco é a verdade.

---

## 8. Erros comuns -- não fazer

- **Nunca** armazene papéis no Keycloak como source of truth -- o **Cordelê** é dono.
  Keycloak é só IdP (autenticação); autorização é do `<service>` Cordelê.
- **Nunca** confie no papel do JWT sem validar `modeloAcessoVersao` (pode estar stale após mudança RBAC).
- **Nunca** aplique permissão inline em UI Angular (`if (user.role === 'admin')`) -- sempre via `AccessDecisionService.can(<perm>)`.
- **Nunca** crie usuário compartilhado (anti-pattern -- audit não rastreia indivíduo).
- **Nunca** permita escalação de papel (usuário com papel X conseguindo criar associação com papel Y > X).
- **Nunca** ignore `EmpresaContextHolder.require()` em application service que toca dado de empresa (RULE-07).
- **Nunca** retorne dados de uma empresa para JWT de outra (cross-empresa leak) -- ver `hexagonal-patterns.md` §5.

---

## 9. Roadmap (futuro, não implementar agora)

Funcionalidades de RBAC mais avançadas (multi-SSO BYOI, custom roles por empresa, aprovação
2-step, emergency access, API keys com risk score) **não são** parte do MVP. Adicionar
somente quando houver demanda concreta de cliente/auditoria.

---

## Referências

- `docs/architecture/shared/multi-empresa.md` -- ADR-001 schema-per-empresa
- `docs/architecture/frontend/standards/access-layer-contracts.md` -- Access Layer FE
- `hexagonal-patterns.md` §5 -- propagação EmpresaContext + cross-empresa guard
- `services-catalog.md` §<service> -- responsabilidades do <service>
