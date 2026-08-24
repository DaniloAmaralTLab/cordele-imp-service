# Session Policy — TTLs, refresh, idle, MFA por papel

> Política diferenciada de sessão por papel canônico. Quem tem mais poder tem **token mais curto** (menor janela de comprometimento). Quem só consulta tem **sessão mais longa** (UX).

## Tabela canônica

| Papel | Access Token TTL | Refresh Token TTL | Idle Timeout | MFA | Restrição IP | Justificativa |
|---|---|---|---|---|---|---|
| **ADMIN** | 10 min | 4 h | 30 min | Obrigatório* | Lista de IPs do escritório | Controle total da empresa, maior risco |
| **GERENTE** | 15 min | 6 h | 45 min | Opcional | Nenhuma | Aprovações, relatórios consolidados |
| **FISCAL** | 15 min | 6 h | 45 min | Opcional | Nenhuma | Emite/cancela NFe — risco fiscal médio |
| **FINANCEIRO** | 15 min | 6 h | 45 min | Opcional | Nenhuma | Gerencia caixa/títulos — risco financeiro médio |
| **VENDEDOR** | 15 min | 8 h | 120 min | Não | Nenhuma | Uso intensivo no dia — UX prioritária |
| **ALMOXARIFE** | 15 min | 8 h | 120 min | Não | Nenhuma | Opera em galpão, fica logado o dia |
| **CRM_OPERADOR** | 15 min | 8 h | 120 min | Não | Nenhuma | Idem vendedor |
| **LOGISTICA_OPERADOR** | 15 min | 8 h | 60 min | Não | Nenhuma | Opera em rota — sessão média |
| **AUDITOR** | 30 min | 8 h | 60 min | Opcional | Nenhuma | Read-only — menos risco; sessão longa para análise |
| **EMERGENCY** *(futuro)* | 10 min | — (sem refresh) | 15 min | Obrigatório | Qualquer | Sessão emergencial — máximo 2h, force re-login |

> *MFA é fase futura. Por enquanto, "Obrigatório" significa "exigir quando MFA for habilitado".

## Conceitos

### Access Token
- JWT enviado em `Authorization: Bearer <token>` em toda requisição.
- Curto por design — minimiza janela se um token for vazado.
- Contém claims: `sub` (usuario_id), `empresa_id`, `papel`, `modelo_acesso_versao`, `data_scope`, `exp`.

### Refresh Token
- Cookie `httpOnly`, `secure`, `sameSite=strict`.
- Usado para gerar novo access token sem re-login.
- Mais longo que access token, mas com `exp` rígido.
- Rotacionado a cada uso (`refresh_token_rotation = true`).

### Idle Timeout
- Tempo máximo sem atividade na UI antes de **forçar re-login**.
- Implementado no FE com `activity-detector`: timer reseta a cada click/keydown/scroll.
- Quando expira, FE chama `/api/v1/iam/sessao/logout` e mostra modal "Sessão expirada por inatividade".

### MFA (futuro)
- Quando implementado, exigir segundo fator no **login** e em **elevações de privilégio** (ex: gerente trocar para empresa diferente).
- Provider: TOTP (Google Authenticator/Authy) primeiro; depois WebAuthn (chave física).

### Restrição IP (opcional)
- Aplicável a papéis ADMIN: lista de CIDRs autorizados configurada por empresa.
- Se requisição vem de fora da lista: `403` com `error.code = 'iam.ip-fora-de-escopo'`.
- Útil para empresas que querem restringir ADMIN ao escritório/VPN.

## Configuração canônica (`application.yml`)

```yaml
cordele:
  iam:
    session:
      policies:
        ADMIN:
          access-token-ttl: 10m
          refresh-token-ttl: 4h
          idle-timeout: 30m
          mfa-required: true
          ip-restriction-enabled: true
        GERENTE:
          access-token-ttl: 15m
          refresh-token-ttl: 6h
          idle-timeout: 45m
          mfa-required: false
        FISCAL:    { access-token-ttl: 15m, refresh-token-ttl: 6h, idle-timeout: 45m }
        FINANCEIRO:{ access-token-ttl: 15m, refresh-token-ttl: 6h, idle-timeout: 45m }
        VENDEDOR:
          access-token-ttl: 15m
          refresh-token-ttl: 8h
          idle-timeout: 120m
          mfa-required: false
        ALMOXARIFE:        { access-token-ttl: 15m, refresh-token-ttl: 8h, idle-timeout: 120m }
        CRM_OPERADOR:      { access-token-ttl: 15m, refresh-token-ttl: 8h, idle-timeout: 120m }
        LOGISTICA_OPERADOR:{ access-token-ttl: 15m, refresh-token-ttl: 8h, idle-timeout: 60m  }
        AUDITOR:           { access-token-ttl: 30m, refresh-token-ttl: 8h, idle-timeout: 60m  }
      defaults:
        # se papel não está na tabela acima
        access-token-ttl: 15m
        refresh-token-ttl: 4h
        idle-timeout: 30m
      jwt:
        signing-algorithm: RS256
        issuer: https://cordele.local
        audience: cordele-api
        clock-skew: 30s
```

## Fluxo de refresh

```
1. FE faz GET /api/com/v1/vendas
   → Authorization: Bearer <access-token-expirado>
   → BE responde 401 com error.code='iam.token-expirado'

2. FE intercepta 401, chama POST /api/v1/iam/sessao/refresh
   → cookie httpOnly carrega refresh-token automaticamente
   → BE valida refresh-token, gera novo par (access + refresh)
   → Refresh-token antigo é invalidado (rotation)
   → Resposta: 200 {accessToken: "..."} + Set-Cookie refresh-token novo

3. FE refaz a requisição original com novo access-token
   → 200 OK
```

## Invalidação por mudança de modelo de acesso

Quando RBAC muda (ADMIN cria papel novo, altera permissão, etc.):

```
1. <service> incrementa cordele_global.modelo_acesso_versao
2. <service> publica cordele.modelo.acesso.alterado
3. Todos os serviços invalidam cache local de AccessDecision
4. Próxima requisição de qualquer usuário traz JWT com versão antiga
5. Filter detecta: jwt.modelo_acesso_versao < global.modelo_acesso_versao
6. Retorna 401 com error.code='iam.sessao.versao-desatualizada'
7. FE chama refresh → novo JWT com versão atual + permissões atualizadas
```

Isso garante que **mudanças de RBAC propagam em segundos**, sem precisar invalidar tokens 1-a-1.

## Logout

`POST /api/v1/iam/sessao/logout`:
- Apaga refresh-token cookie (`Set-Cookie: refresh-token=; Max-Age=0`).
- Invalida server-side: adiciona `sub` + `jti` a blacklist Redis com TTL = access-token-ttl restante.
- Próxima request com access-token ainda válido (não expirou) será rejeitada via blacklist check.

Blacklist é necessária porque JWT é stateless — sem ela, access-token vivo após logout continua válido até expirar naturalmente.

## Anti-patterns

- ❌ Access token de 1h ou mais — janela de vazamento gigante.
- ❌ Refresh token sem rotation — se vazar, atacante pode renovar para sempre.
- ❌ Idle timeout no BE só (sem timer FE) — usuário fica sem aviso até clicar e levar 401.
- ❌ Salvar tokens em `localStorage` (XSS rouba) — sempre cookie `httpOnly` para refresh; access token em memória.
- ❌ Refresh token = access token (mesmo TTL) — perde o ponto da separação.
- ❌ JWT com claims gigantes (lista de 100 permissões dentro) — usar `modelo_acesso_versao` e buscar no cache.

## Métricas de monitoramento

- `cordele_iam_session_active_total{papel}` — sessões ativas por papel (Prometheus gauge).
- `cordele_iam_session_refresh_total{papel, outcome}` — taxa de refresh por papel.
- `cordele_iam_session_logout_total{motivo}` — logout / timeout / forced.
- `cordele_iam_session_blacklist_size` — tamanho da blacklist (alerta se > 10k).

## Referências

- Modelo geral RBAC: [[modelo]]
- Cache Redis (sessão + access decision): [[modelo]] §7
- Data scope no JWT: [[data-scope]]
- Error model (códigos `iam.*`): [[../contratos/error-model]]
