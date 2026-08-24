# Modelo de Dados -- Índice

DDL canônico do Cordelê (Postgres 15+).

## Fonte de verdade

**`sql/01_schema_novo.sql`** -- DDL completo (~70 tabelas) que será aplicado pelo
`cordele-migrations`. NÃO duplicar aqui; este README só aponta e categoriza.

## Documentos relacionados (raiz, ainda fonte de verdade)

| Documento | Conteúdo |
|---|---|
| `MODELO_DADOS.md` | Narrativa do modelo conceitual (entidades, relacionamentos, decisões) |
| `MAPEAMENTO_DADOS_LEGADO.md` | De-para legado (`tab*`) → novo (entidades agrupadas por módulo) |
| `ANALISE_RECUPERACAO_CHAVES.md` | Achado crítico: dump legado omitiu PKs auto-incremento de toda tabela mestre/documento; estratégias de recuperação por entidade |

## Agrupamento por schema

### `cordele_global` (compartilhado entre as empresas)

Tabelas planejadas (a confirmar contra `sql/01_schema_novo.sql`):
- `usuario`, `papel`, `permissao`, `usuario_empresa`, `papel_permissao` (IAM)
- `empresa` (catálogo das 5 unidades + parâmetros)
- `ncm`, `cfop`, `cst_icms`, `cst_pis_cofins`, `csosn`, `natureza_operacao` (catálogos fiscais)
- `plano_contas_master`, `centro_custo_master` (plano contábil padrão do grupo)
- `evento_auditoria` (trilha consolidada — duplicada por empresa? a decidir)

### `emp_<empresa>` (replicado 5×)

Agrupamento por módulo:

| Módulo | Tabelas-chave |
|---|---|
| CAD | `cliente`, `fornecedor`, `produto`, `vendedor`, `transportadora`, `grupo_produto`, `marca` |
| COM | `orcamento`, `proposta`, `venda`, `pedido_venda`, `item_venda`, `comissao` |
| FIS | `nfe`, `nfce`, `cte`, `item_nfe`, `evento_sefaz`, `inutilizacao` |
| FIN | `conta_pagar`, `conta_receber`, `movimento_caixa`, `caixa`, `cheque`, `conciliacao_bancaria`, `banco_conta` |
| EST | `movimento_estoque`, `saldo_estoque`, `inventario`, `local_estoque`, `transferencia_estoque` |
| CRM | `lead`, `oportunidade`, `tarefa`, `interacao`, `funil`, `estagio_funil`, `pos_venda` |
| LOG | `entrega`, `rota`, `motorista`, `veiculo`, `frete` |

Confirmar contra `sql/01_schema_novo.sql` quando começar a implementação de cada módulo.

## Como adicionar/alterar tabela

1. Editar `sql/01_schema_novo.sql` (DDL canônico).
2. Criar migration em `backend/cordele-migrations/src/main/resources/db/migration/{global|empresa}/V<N>__<modulo>_<descricao>.sql`.
3. Atualizar este README (categoria) se for tabela nova.
4. Atualizar `MODELO_DADOS.md` (narrativa) se for decisão de modelagem.
5. Rodar `./gradlew :cordele-migrations:bootRun` localmente para validar.
