# Data Scope — Restrição de dados dentro da empresa

> Como o Cordelê **filtra dados** que um usuário pode ver, **dentro da mesma empresa**, baseado em atributos do papel ou da associação `usuario_empresa`.

## O problema

Multi-empresa ([[multi-empresa]]) isola dados **entre** empresas via schema-per-empresa. Mas dentro de **uma mesma empresa**, papéis diferentes precisam ver fatias diferentes dos dados:

- O **vendedor João** está em `<empresa-schema-1>`. Ele vê todos os clientes da empresa, mas só vê **as próprias vendas** (não as do Carlos).
- O **vendedor Carlos** (também em `<empresa-schema-1>`) vê **as próprias vendas**.
- O **gerente Claudinei** vê vendas de **todos os vendedores** da empresa.
- O **almoxarife Pedro** opera apenas o **estoque do Galpão Principal SP**, não vê movimentações de outros depósitos.
- O **ADMIN** vê tudo.

Sem data_scope, o vendedor João conseguiria listar comissões do Carlos — vazamento horizontal.

## Tipos de data_scope canônicos

Definidos por `usuario_empresa.data_scope` (VARCHAR) e/ou `usuario_empresa.data_scope_tipo` (VARCHAR):

| Tipo | `data_scope_tipo` | `data_scope` (valor) | Significado | Papéis típicos |
|---|---|---|---|---|
| **Sem restrição** | `null` ou `'EMPRESA_COMPLETA'` | `null` | Vê tudo da empresa | ADMIN, GERENTE, FISCAL, FINANCEIRO, AUDITOR |
| **Próprios documentos (vendedor)** | `'VENDEDOR'` | `<vendedor_id>` (UUID) | Vê só registros onde `vendedor_id = <data_scope>` | VENDEDOR |
| **Próprio local de estoque** | `'LOCAL_ESTOQUE'` | `<local_id>` (UUID) | Vê só registros onde `local_id = <data_scope>` | ALMOXARIFE (quando filial) |
| **Múltiplos locais** | `'LOCAIS'` | `<local1_id>,<local2_id>` (CSV) | Vê só registros nos N locais listados | ALMOXARIFE multi-filial |
| **Próprio grupo** | `'GRUPO_VENDEDOR'` | `<gerente_id>` (UUID) | Vê próprios + dos subordinados | Supervisor de equipe |

> O schema da tabela `cordele_global.usuario_empresa` (definido em [[modelo]] §4) já tem o campo `data_scope VARCHAR(50)`. Vamos adicionar `data_scope_tipo VARCHAR(50)` em migração futura.

## Cenários ilustrados

### Cenário 1 — Maria, vendedora em ST Wood

**Setup:**
```sql
-- João = vendedor com ID 'venda-001'
-- Maria = vendedora com ID 'venda-002'
INSERT INTO cordele_global.usuario_empresa VALUES (
  'maria-user-id', '<empresa-schema-1>', 'VENDEDOR',
  data_scope_tipo='VENDEDOR', data_scope='venda-002'
);
```

**Maria faz GET `/api/comercial/v1/vendas`:**

1. Filtro Spring Security lê JWT, popula `EmpresaContextHolder.empresaId='<empresa-schema-1>'`.
2. `<service>` retorna `AccessDecision`:
   ```json
   {
     "usuarioId": "maria-user-id",
     "empresaId": "<empresa-schema-1>",
     "papel": "VENDEDOR",
     "permissoes": ["com.venda.read", "com.venda.criar", ...],
     "dataScope": {
       "tipo": "VENDEDOR",
       "valor": "venda-002"
     }
   }
   ```
3. `<service>` lê `AccessDecision.dataScope` e aplica filtro:
   ```sql
   SELECT * FROM <empresa-schema-1>.venda
   WHERE vendedor_id = 'venda-002'   -- ← filtro automático via data_scope
   ORDER BY data_emissao DESC
   ```
4. Resposta: só vendas da Maria.

### Cenário 2 — Claudinei (gerente)

Mesma chamada `GET /api/comercial/v1/vendas`, mas papel = GERENTE:

```json
{
  "papel": "GERENTE",
  "dataScope": null   // ou {tipo: "EMPRESA_COMPLETA"}
}
```

`<service>` não aplica filtro adicional — query sem `WHERE vendedor_id`. Vê vendas de todos os vendedores da `<empresa-schema-1>`.

### Cenário 3 — Pedro (almoxarife multi-local)

Pedro opera o Galpão Principal SP e o Galpão Secundário SP, mas não a Filial RJ:

```sql
INSERT INTO usuario_empresa VALUES (
  'pedro-user-id', '<empresa-schema-1>', 'ALMOXARIFE',
  data_scope_tipo='LOCAIS', data_scope='local-principal-sp,local-secundario-sp'
);
```

`GET /api/estoque/v1/movimentos` retorna apenas `WHERE local_id IN ('local-principal-sp', 'local-secundario-sp')`.

### Cenário 4 — Cross-vendedor proibido

João faz `GET /api/comercial/v1/vendas/<id-da-Maria>`:
- BE valida: a venda existe, o `vendedor_id != joão.dataScope.valor`.
- Retorna `403 Forbidden` com `error.code = "com.venda.fora-de-escopo"`.

Não confundir com `404` — Maria existe, só não é acessível ao João.

## Estrutura do AccessDecision

Resposta canônica de `POST /api/v1/iam/access/evaluate` (estende §5 do [[modelo]]):

```java
public record AccessDecisionResponse(
    UUID usuarioId,
    String empresaId,
    String papel,
    List<String> permissoes,
    DataScope dataScope,              // ← agora estruturado
    long modeloAcessoVersao,
    SessionPolicy sessionPolicy
) {}

public record DataScope(
    String tipo,                       // VENDEDOR / LOCAL_ESTOQUE / LOCAIS / GRUPO_VENDEDOR / null
    List<String> valores               // 1 ou N IDs; null = sem restrição
) {}
```

## Quais tabelas precisam de data_scope

| Módulo | Tabela | Coluna filtro | Quem aplica data_scope |
|---|---|---|---|
| COM | `venda` | `vendedor_id` | tipo='VENDEDOR' |
| COM | `orcamento` | `vendedor_id` | tipo='VENDEDOR' |
| COM | `pedido_venda` | `vendedor_id` (via venda) | tipo='VENDEDOR' |
| COM | `comissao_calculada` | `vendedor_id` | tipo='VENDEDOR' |
| CRM | `oportunidade` | `vendedor_id` | tipo='VENDEDOR' |
| CRM | `lead` | `responsavel_vendedor_id` | tipo='VENDEDOR' |
| EST | `movimento_estoque` | `local_id` | tipo='LOCAL_ESTOQUE' ou 'LOCAIS' |
| EST | `transferencia_estoque` | `local_origem_id` OR `local_destino_id` | idem |
| EST | `saldo_estoque` | `local_id` | idem |
| FIN | `titulo_receber` | (via venda.vendedor_id) | tipo='VENDEDOR' |
| LOG | `entrega` | (via venda.vendedor_id) | tipo='VENDEDOR' (raro) |

## Convenções

- **VENDEDOR** sempre filtra por `vendedor_id` — nunca por `cliente_id` (vendedor vê todos os clientes; só não vê **vendas** de outros).
- **ALMOXARIFE** filtra estoque por `local_id`, mas vê produtos/clientes/fornecedores normalmente.
- **GERENTE** nunca tem data_scope — vê tudo da empresa.
- **AUDITOR** sempre read-only sem data_scope — vê tudo, não muda nada.

## Anti-patterns

- ❌ Hardcode `if (papel == 'VENDEDOR')` no controller — sempre via filtro automático (ver [[enforcement]]).
- ❌ Aplicar data_scope no FE como única defesa — sempre validar no BE (FE é só UX).
- ❌ Esquecer `data_scope` na query manual de relatório — o filtro automático só funciona em queries via repository padrão; queries customizadas precisam aplicar manualmente.
- ❌ Configurar `data_scope_tipo='VENDEDOR'` mas deixar `data_scope=null` — o usuário não vê **nada** (filtro `WHERE vendedor_id = null` retorna 0 linhas).
- ❌ Mudar `data_scope` de usuário sem bumpar `modelo_acesso_versao` — JWT em cache mantém scope antigo.

## Referências

- Modelo geral RBAC: [[modelo]]
- Enforcement técnico (Hibernate Filter): [[enforcement]]
- Tabela `usuario_empresa`: [[modelo]] §4
- Session policy: [[session-policy]]
