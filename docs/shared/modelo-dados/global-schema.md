# Schema `cordele_global`

Schema **compartilhado** entre as empresas do grupo. Vive uma única vez no Postgres.

## Quando usar este schema

- Cadastro do **próprio grupo** (não muda por empresa): usuários, papéis, permissões.
- **Catálogos fiscais nacionais** que valem para todas as unidades: NCM, CFOP, CST/CSOSN, Natureza de Operação, **tabelas RTC** (CST IBS/CBS, cClassTrib, cCredPres, NCM-IS).
- **Plano de contas master** + Centro de Custo master (template aplicado e refinado por empresa).
- **Auditoria consolidada** cross-empresa (filtrável por `empresa_id`).
- **Catálogo das empresas** + parâmetros do grupo.

> **Princípio:** se o dado é "do grupo" ou "do Brasil" (catálogo nacional), vai aqui. Se é "do dia-a-dia operacional de uma unidade", vai em `emp_<unidade>` ([[empresa]]).

## Categorias e tabelas

### IAM (identidade e acesso)

```
usuario                  -- pessoa física que loga
papel                    -- ADMIN, GERENTE, VENDEDOR, FISCAL, FINANCEIRO, ALMOXARIFE, ...
permissao                -- cad.cliente.read, com.venda.criar, fis.nfe.emitir, ...
papel_permissao          -- N:N papel ↔ permissão
usuario_empresa          -- 1 usuário pode operar N empresas; cada associação carrega um papel
modelo_acesso_versao     -- singleton; incrementa quando RBAC muda (invalida cache)
```

Detalhes em [[../rbac/modelo]] (RBAC) e [[../multi-empresa]] (ADR-001).

### Catálogo das empresas

```
empresa                  -- 5 unidades: ST Wood, Certa Madeiras, Beludia, Empório Wood, Solução
                            campos: empresa_id (slug `emp_<x>`), nome_fantasia, razao_social, cnpj,
                                    inscricao_estadual, regime_tributario, ativo, parametros_jsonb
```

`empresa_id` = nome do schema operacional (`<empresa-schema-1>`, `<empresa-schema-2>`, ...). É a chave que liga `cordele_global.*` a `emp_<x>.*`.

### Catálogos fiscais nacionais

```
ncm                      -- ~10.800 códigos NCM da Receita; carregado via importação CSV (B1)
cfop                     -- ~150 CFOPs (entrada e saída, intra/inter/exterior)
cst_icms                 -- 00, 10, 20, 30, 40, 41, 50, 51, 60, 70, 90
cst_pis                  -- 01, 02, 03, ..., 99
cst_cofins               -- mesmas faixas do PIS
csosn                    -- 101..900 (Simples Nacional)
natureza_operacao        -- catálogo natural editado pelo grupo (mapeia para CFOP)
observacao_nf            -- textos padrão do DANFE (B5)
```

### Catálogos RTC (Reforma Tributária, LC 214/2025)

```
cst_ibs_cbs              -- ~15 códigos novos (000, 010, 020, 040, 050, 060, ...) — ver [[../../../reforma/Glossário RTC v3]]
cclasstrib               -- ~300 combinações de Classificação Tributária IBS/CBS
ccredpres                -- 5 códigos canônicos de crédito presumido
ncm_is                   -- NCMs sujeitos a Imposto Seletivo (bebidas, fumo, veículos, agrotóxicos)
tabela_rtc_versao        -- controle de versionamento (cada update via portal RTC bumpa a versão)
```

Detalhes em [[rtc-reforma-tributaria]] (memória do projeto).

### Plano de contas master

```
plano_contas_master      -- árvore canônica 3 níveis (1.01.01 ...); cada empresa estende
centro_custo_master      -- catálogo master de CC; cada empresa cria os próprios sob o master
```

### Auditoria

```
evento_auditoria         -- trilha consolidada de TODOS os eventos `cordele.*` (JMS consumer)
                            campos: id, empresa_id (nullable), usuario_id, evento, payload_jsonb,
                                    correlation_id, timestamp, source_service
```

> Decisão pendente: `evento_auditoria` consolidado em `cordele_global` OU dividido por `emp_<x>.evento_auditoria` (com sub-tabela). Trade-off: query cross-empresa fácil vs. retenção/backup separados.

## Convenções

- Todas as tabelas globais começam com prefixo conceitual (`usuario_*`, `papel_*`, etc.).
- PKs: `UUID` para entidades de domínio (usuário, papel) · `BIGSERIAL` para catálogos importados (NCM, CFOP) · slug `VARCHAR(50)` para entidades canônicas curtas (empresa_id).
- Soft-delete: campo `ativo BOOLEAN NOT NULL DEFAULT true` (não usar `DELETE`).
- Timestamps: `criado_em TIMESTAMPTZ NOT NULL DEFAULT now()` + `atualizado_em TIMESTAMPTZ`.

## Migrations

Vivem em `backend/cordele-migrations/src/main/resources/db/migration/global/V<N>__<tema>_<descricao>.sql`.
Rodam **uma vez** (não replicam por empresa). Exemplos:
- `V001__iam_papel_permissao.sql`
- `V002__catalogo_ncm.sql`
- `V003__rtc_cclasstrib.sql`

## Anti-patterns

- ❌ Colocar dado operacional (venda, NFe, movimento) em `cordele_global` — vai em `emp_<x>`.
- ❌ Duplicar NCM/CFOP por empresa — catálogos nacionais ficam no global.
- ❌ Permitir que um microserviço operacional escreva em `cordele_global` arbitrariamente — somente `<service>` (RBAC) e `cordele-migrations` (seed).
- ❌ Esquecer `empresa_id` em `evento_auditoria` quando o evento vem de operação empresarial.

## Referências

- DDL canônico: `sql/01_schema_novo.sql`
- ADR-001 schema-per-empresa: [[../multi-empresa]]
- Modelo RBAC: [[../rbac/modelo]]
- Catálogo de serviços: [[../../backend/standards/services-catalog]]
