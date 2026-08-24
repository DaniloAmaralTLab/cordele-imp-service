# Persistence Conventions — Cordelê

> Convenções canônicas Postgres + JPA aplicáveis a **todas** as entidades do Cordelê.
>
> **Fonte de verdade:** `templates/architecture/decisions/persistence.arch.json` (D-066).
> Este markdown é gerado deterministicamente. Não editar à mão — o próximo render sobrescreve.

## Primary Key

- **Estratégia:** `uuid_v7`
- **Função geradora:** `uuid_generate_v7()`
- **Tipo SQL:** `UUID`

**Racional:** Time-ordered UUIDs cluster well in B-tree indexes (unlike v4) and avoid index hot-spots that BIGSERIAL would create under high write rate. Single PK strategy across all tables keeps the migration generator and entity generator uniform.

## Extensões Postgres requeridas

`be-migration-generator` emite `CREATE EXTENSION IF NOT EXISTS` na V0001 de cada schema. Lista canônica:

| Extensão | Propósito |
|---|---|
| `uuid-ossp` | Provides uuid_generate_v4 fallback and is required by some uuid_v7 implementations. |
| `pgcrypto` | gen_random_uuid() used in seed migrations; some uuid_v7 implementations build on it. |
| `pg_trgm` | Trigram indexes for substring search on names, codes and descriptions. |
| `unaccent` | Accent-insensitive search (LOWER(unaccent(nome)) LIKE ...). |

## Audit columns

Todas as raízes de agregado (all_root_aggregates) carregam 4 colunas de auditoria:

| Coluna | Tipo | Significado |
|---|---|---|
| `criado_em` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | Momento de criação |
| `criado_por_usuario_id` | `UUID` | Usuário que criou |
| `atualizado_em` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | Momento da última atualização |
| `atualizado_por_usuario_id` | `UUID` | Usuário que atualizou pela última vez |

`be-entity-generator` insere essas colunas automaticamente em raízes; em entidades opt-in (`applies_to=opt_in`), declarar explicitamente na DDL.

## Soft-delete

Em vez de `DELETE` físico, raízes de agregado têm:

- **Coluna:** `ativo`
- **Tipo:** `BOOLEAN NOT NULL DEFAULT TRUE`
- **Companion table:** `exclusao_documento` — guarda o evento de exclusão (motivo, usuário, timestamp) para auditoria.

Queries em listas filtram por `ativo = TRUE` por padrão; queries cross-schema de auditoria podem ignorar.

## Tipos de coluna canônicos

| Nome canônico | SQL | Java | Quando usar |
|---|---|---|---|
| `monetary` | `NUMERIC(15,2)` | `java.math.BigDecimal` | Money amounts (BRL). 13 digits before the decimal handles totals well into the billions, 2 decimals match centavos. |
| `quantity` | `NUMERIC(15,4)` | `java.math.BigDecimal` | Item quantities. 4 decimals accommodate fractional units (kg, m³, hours). |
| `unit_price` | `NUMERIC(15,4)` | `java.math.BigDecimal` | Unit prices that may have sub-cent precision (e.g. tax rates applied per unit). |
| `percentage` | `NUMERIC(5,2)` | `java.math.BigDecimal` | Percentages 0..100 with 2 decimals. Always validated with CHECK (col BETWEEN 0 AND 100). |
| `tenant_id_slug` | `VARCHAR(50)` | `java.lang.String` | Tenant id slug like 'emp_alpha' (matches schema name). |
| `code_short` | `VARCHAR(20)` | `java.lang.String` | Short codes (UFs, CFOPs, status enums, numbered identifiers like 'ORC-2026-00042'). |
| `name_long` | `VARCHAR(150)` | `java.lang.String` | Long human names (cliente.nome, produto.descricao). |

Use estes ao escrever DDL — evita drift de precisão entre tabelas (uma tem `NUMERIC(10,2)`, outra `NUMERIC(15,2)`, conciliação quebra).

## Numeração humana

Documentos com número humano (orçamentos, vendas, pedidos, propostas) seguem o padrão:

- **Pattern:** `<PREFIX>-<YEAR>-<SERIAL>`
- **Exemplo:** `ORC-2026-00042`
- **Padding do serial:** 5 dígitos (zero-pad)
- **Sequência Postgres:** `seq_<entity>_numero` (uma por entidade)
- **Tipo SQL:** `VARCHAR(20)`

O serial vem de `nextval('seq_orcamento_numero')` + ano corrente.

## Schema annotation

Cada bloco DDL declara seu schema-alvo no primeiro comentário; `be-migration-generator` roteia o bloco para `db/migration/<schema>/V<N>__<modulo>_<descricao>.sql`.

- **Prefixo do comentário:** `-- schema: <schema>`
- **Valores válidos:** `global`, `empresa`

Exemplo:

```sql
-- schema: empresa
CREATE TABLE orcamento (
    orcamento_id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    ...
);
```

First line of every DDL block declares its target schema. be-migration-generator routes the block to db/migration/<schema>/V<N>__<module>_<description>.sql accordingly.

## Foreign Keys

| Tipo de relacionamento | Estratégia |
|---|---|
| Same schema | `physical_fk` (REFERENCES explícito) |
| Cross schema | `logical_fk` (UUID sem REFERENCES, validação em service) |

Cross-schema FK uses a UUID column WITHOUT REFERENCES; referential integrity is enforced in the application service (with a lookup that fails with not_found before persisting).

**Racional:** Postgres does support cross-schema FK in principle but it complicates per-tenant schema lifecycle (drop, restore, migration). Logical FK with service-level validation keeps schemas independently movable.

## Snapshot pattern (ADR-005)

Campos suffixados com `_snapshot` (ex: `cliente_nome_snapshot`, `vendedor_regra_comissao_snapshot`) capturam o **estado no momento da decisão** e tornam-se imutáveis a partir de:

```
status IN ('CONFIRMADA','FATURADA','CANCELADA')
```

Fields suffixed with _snapshot are immutable once the parent aggregate transitions to a closed state. Enforced in the application service (rejects updates) and in the cancellation policy (cancellation creates a new immutable record rather than mutating the original).

## Encoding

`UTF-8` em todos os schemas — não usar LATIN1 ou WIN1252 (atrapalha acentuação consistente do legado migrado).

## Como evoluir esta convenção

1. Editar `templates/architecture/decisions/persistence.arch.json` — ajustar campo específico (adicionar `column_type`, mudar `applies_to`, etc.).
2. Validar: `python scripts/arch_decisions.py validate --aspect persistence`.
3. Bumpar `version` e `last_changed`.
4. Re-renderizar este markdown.
5. Migrar tabelas existentes se a mudança é breaking (audit columns renomeadas, por exemplo) — uma migration única do `cordele-migrations` para alinhar todos os schemas.

## Anti-patterns

- ❌ Editar este markdown direto — ele é gerado. Próximo render sobrescreve.
- ❌ Usar `NUMERIC(10,2)` ou `NUMERIC(12,4)` ad-hoc — sempre referenciar um `column_type` canônico do catálogo acima. Adicionar tipo novo via JSON se necessário.
- ❌ Esquecer audit columns em raiz de agregado — `be-entity-generator` reclama (Phase 2 hook futuro).
- ❌ FK física cross-schema — sempre validar logical FK em service.
- ❌ Mutar campo `_snapshot` após `status IN ('CONFIRMADA','FATURADA','CANCELADA')` — violação de invariante.
- ❌ Inventar pattern de numeração próprio (`ORC2026/00042` em vez de `ORC-2026-00042`) — quebra parsing/buscas globais.
