# ETL Legado → Cordelê

> Mapeamento e estratégia de migração do **dump do ERP de produção atual** (única unidade
> Empório Wood) para a estrutura nova multi-empresa.

## Fonte canônica

| Artefato | Localização | O que é |
|---|---|---|
| Dump SQL legado | `BD/` (read-only) | Backup completo do ERP atual (`sismaster_emporiowood`) — auditoria histórica, NUNCA editar |
| Schema legado parsed | `sql/02_schema_legado.sql` | DDL extraído do dump, para referência |
| Schema novo (alvo) | `sql/01_schema_novo.sql` | DDL canônico do Cordelê (~70 tabelas) |
| Script de conversão | `sql/03_converter.py` | Parser inicial: dump → CSVs intermediários |
| Loader | `sql/03_load_all.sql` | Importa CSVs intermediários no Postgres |
| ETL por módulo | `sql/04..15_*.sql` + `sql/0[679]*_reconstruir_*.py` | 1 par (.py reconstrutor + .sql ETL) por entidade |

## Documentos relacionados

| Doc | Conteúdo |
|---|---|
| [`status-por-entidade.md`](status-por-entidade.md) | Tabela: o que está pronto, o que falta, o que tem ressalva (clientes ✅, produtos ✅, vendas 99%, compras ⚠️, ...) |
| `../../../PLANO_MIGRACAO.md` (raiz) | Fases da migração (POC → piloto → cutover) — narrativa de alto nível |
| `../../../MODELO_DADOS.md` (raiz) | Modelo conceitual narrativo (entidades, relacionamentos, decisões) |

## Achado crítico: chaves omitidas no dump

O dump legado **omitiu os PKs auto-incremento** de toda tabela mestre/documento. Estratégia de recuperação por entidade:

- **Clientes / Produtos / Fornecedores**: matching por CNPJ/CPF + nome — 99% reconciliação.
- **Vendas**: reconstruir sequencial via `data_emissao + cliente_id + valor_total + vendedor_id` — 99%.
- **Orçamentos**: idem vendas — 95% (alguns sem cliente).
- **Notas Fiscais**: chave NFe (44 dígitos) é mantida — 100%.
- **Compras / Boletas**: dados parciais, ainda em investigação.

Cada reconstrutor `.py` documenta sua heurística no docstring.

## Fluxo da migração (resumo)

```
┌─ 1. Dump legado (BD/)
│     ↓
│  python sql/03_converter.py        → CSVs em sql/legado_data/
│     ↓
│  psql -f sql/03_load_all.sql       → tabelas intermediárias com PKs sintéticas
│     ↓
│  ┌─ por entidade ─────────────────────────────┐
│  │  python sql/07_reconstruir_vendas.py       │  ← recupera FKs perdidas
│  │  psql -f sql/08_etl_vendas.sql             │  ← INSERT INTO <empresa-schema-4>.venda
│  └────────────────────────────────────────────┘
│     ↓
│  Validação: contagem + amostra + diff financeiro
│     ↓
│  Repete para clientes, produtos, fornecedores, NFe, compras, etc.
└─

Resultado: <empresa-schema-4> populado, demais emp_* começam vazias (greenfield).
```

## Como adicionar entidade nova ao ETL

1. Mapear no `status-por-entidade.md` qual tabela do legado vira qual do novo.
2. Se há FKs perdidas, criar `sql/N_reconstruir_<entidade>.py` com heurística documentada.
3. Criar `sql/M_etl_<entidade>.sql` que faz o `INSERT INTO <empresa-schema-4>.<tabela>`.
4. Validar contagem + spot-check de 10 registros + soma de campos numéricos críticos.
5. Atualizar `status-por-entidade.md` para ✅ ou ⚠️ conforme o resultado.

## Quando começar a usar a `<empresa-schema-4>` populada

- Após **clientes + produtos + vendas + NFe + estoque + financeiro** chegarem a ≥ 99% reconciliados.
- Antes disso: trabalhar com fixtures sintéticas em ambiente dev (não usar dados reais para evitar leaks).

## Anti-patterns

- ❌ Editar arquivos em `BD/` — é auditoria histórica imutável.
- ❌ Pular fase de reconstrução (`.py`) e fazer ETL direto — chaves vão divergir.
- ❌ Migrar uma entidade sem antes ter sua dependência migrada (ex: vendas antes de cliente + produto + vendedor).
- ❌ Considerar migração "feita" sem validação cruzada (contagem + soma financeira deve bater com o legado).

## Referências

- ADR multi-empresa (por que só `<empresa-schema-4>` recebe dump): [[../multi-empresa]]
- Schema operacional alvo: [[../modelo-dados/empresa]]
- Mapa de FKs novo: [[../modelo-dados/relacionamentos]]
