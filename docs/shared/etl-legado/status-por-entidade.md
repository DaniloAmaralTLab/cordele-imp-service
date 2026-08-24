# Status da migração — por entidade

> Snapshot do estado de cada entidade do legado migrada para `<empresa-schema-4>`.
> Atualizar a cada execução de ETL.

## Legenda

| Símbolo | Significado |
|---|---|
| ✅ | Migração validada — contagem bate, soma financeira bate, spot-check OK |
| 🟡 | Migrado mas com ressalvas (~95-99%; alguns registros omitidos ou inferidos) |
| ⚠️ | Migrado parcial — entender o gap antes de usar em produção |
| ❌ | Não migrado ainda |
| ⊘ | Decidido **não migrar** (entidade aposentada ou substituída por novo conceito) |

## Tabela canônica

| Módulo | Entidade | Status | Tabela origem (legado) | Tabela destino (`<empresa-schema-4>`) | Script reconstrutor | Script ETL | Observações |
|---|---|---|---|---|---|---|---|
| CAD | Clientes | ✅ | `tabclientes` + `tabclientesempresas` | `cliente` | (matching CNPJ+nome) | `04_etl_clientes.sql` | 99% reconciliação |
| CAD | Fornecedores | ✅ | `tabfornecedores` | `fornecedor` | — | `05_etl_cadastros.sql` | OK |
| CAD | Produtos | ✅ | `tabprodutos` + `tabprodempresas` | `produto` | — | `05_etl_cadastros.sql` | OK |
| CAD | Vendedores | ✅ | `tabvendedores` + `tabvendedoresempresas` | `vendedor` | — | `05_etl_cadastros.sql` | OK |
| CAD | Transportadoras | ✅ | `tabtransp` | `transportadora` | — | `05_etl_cadastros.sql` | Sem dados de frota — recadastrar |
| CAD | Grupos de produto | ✅ | `tabgrandegrupo` + `tabgrupo` + `tabsubgrupo` | `grupo_produto` | — | `05_etl_cadastros.sql` | Hierarquia OK |
| CAD | Obras/Projetos | 🟡 | `tabobras` | `obra_projeto` | (matching cliente) | `05_etl_cadastros.sql` | 95% (alguns sem cliente vinculado) |
| EST | Locais de estoque | ✅ | `tablocaisestoque` | `local_estoque` | — | `06_etl_estoque.sql` | OK |
| EST | Saldo de estoque | ✅ | `tabestoqueatual` | `saldo_estoque` | — | `06_etl_estoque.sql` | Snapshot do dia do dump |
| EST | Movimentação histórica | 🟡 | `tabestoquehis` (19.306 linhas) | `movimento_estoque` | — | `06_etl_estoque.sql` | OK; alguns sem origem clara |
| COM | Vendas | 🟡 | `tabvendas` + `tabvendasdetalhe` (PKs perdidas) | `venda` + `item_venda` | `07_reconstruir_vendas.py` | `08_etl_vendas.sql` | 99% — heurística data+cliente+valor+vendedor |
| COM | Orçamentos | 🟡 | `taborcamentos` | `orcamento` | `09_reconstruir_orcamentos.py` | `10_etl_orcamentos.sql` | 95% — alguns sem cliente |
| COM | Pedidos | ❌ | `tabpedidos` | `pedido_venda` | — | (a fazer) | Esperar piloto |
| COM | Comissões | ❌ | `tabcomissao` | `comissao_calculada` | — | (a fazer) | Recalcular em vez de migrar |
| FIS | NF-e | ✅ | `tabnfe` + `tabnfeitens` (chave NFe 44 dígitos preservada) | `nfe` + `item_nfe` | `11_reconstruir_nf.py` | `12_etl_nf.sql` | 100% — chave NFe é PK natural |
| FIS | Eventos SEFAZ | 🟡 | `tabdetalhesfiscais` (1.685) + `tabnfref` (24) + `tabinutilizacao` (8) | `evento_sefaz` + `inutilizacao` | — | `12_etl_nf.sql` | OK; XMLs raw preservados |
| FIS | Notas Recebidas | ❌ | `tabnotasrec` | `nota_recebida` | — | (a fazer) | Necessário para conferência com COM |
| FIS | Grupos de tributação | 🟡 | `tabgrupotrib*` (5 tabelas relacionadas) | `grupo_tributacao` + matriz | — | (a fazer) | Reconstrução manual recomendada (regras mudam muito) |
| FIN | Contas a Receber | 🟡 | `tabbolvenda` (2.523) + `tabbolnota` (1.929) | `titulo_receber` | `13_reconstruir_compras.py`* | (a fazer) | *script existe mas é compartilhado; refinar |
| FIN | Contas a Pagar | ⚠️ | `tabbolcompra` (1.949) + `tabbolcompraplano` (1.783) | `titulo_pagar` + rateio | — | (a fazer) | Rateio em plano de contas tem dados parciais |
| FIN | Caixa / Movimentos | 🟡 | `tabdetalhecaixa` (4.782) + `tabmovcaixa` | `caixa_sessao` + `movimento_caixa` | — | (a fazer) | Histórico OK; sessões abertas precisam fechamento manual |
| FIN | Cheques | 🟡 | `tabchequenosso` (90) + `tabchequespgcompra` (90) | `cheque` | — | (a fazer) | Status atual nem sempre claro |
| FIN | Transferências entre contas | 🟡 | `tabtransf` (265 linhas) | `transferencia_conta` | — | (a fazer) | Algumas duplicadas com `movimento_caixa` |
| FIN | Conciliação | ⚠️ | `tablogobancario` (64) | `conciliacao_par` | — | (a fazer) | Histórico pequeno — provavelmente recomeçar |
| FIN | Patrimônio | 🟡 | `tabresumopatrimonial` (142) + detalhe (2.114) | `patrimonio` + `patrimonio_depreciacao` | — | (a fazer) | Conferência manual antes de migrar |
| FIN | Plano de contas | ✅ | `tabplanocontas` | `plano_contas` (após estender master) | — | `05_etl_cadastros.sql` | OK |
| FIN | Centros de custo | ✅ | `tabcentrocusto` | `centro_custo` | — | `05_etl_cadastros.sql` | OK |
| FIN | Bancos / Agências / Cartões | ✅ | `tabbanco` (36) + `tabagencia` (94) + `tabcartao` (28) | `banco_conta` + (catálogos) | — | `05_etl_cadastros.sql` | Catálogo público; reusar |
| FIN | Formas de pagamento | ✅ | `tabformaspg` | `forma_pagamento` | — | `05_etl_cadastros.sql` | OK |
| FIN | Caixas (PDV) | ✅ | `tabcaixa` (7) | `caixa` | — | `05_etl_cadastros.sql` | OK |
| AUD | Log de auditoria | ⊘ | `tablog` | `cordele_global.evento_auditoria` | — | — | **Não migrar** — começar do zero (formato muda) |
| AUD | Exclusões (3 tabelas) | 🟡 | `tabvendasexcl` (126) + `tabvendasdetalheexcl` (418) + `tabbolvendaexcl` (411) | `exclusao_documento` (consolidado) | — | (a fazer) | Consolidar antes de migrar |
| CRM | (todo o módulo) | ⊘ | — (não existe no legado) | `lead`, `oportunidade`, `tarefa`, etc. | — | — | **Greenfield** — sem dado para migrar |
| LOG | Motoristas | 🟡 | `tabmotoristas` | `motorista` | — | (a fazer) | Validar CNH/categoria/validade |
| LOG | Status de entrega | ⊘ | `tabentregastatus` (5) | `status_entrega` | — | — | Recriar catálogo (poucos itens) |
| LOG | Veículos / Frota | ⊘ | `tabanoveiculo` + `tabmarcaveiculo` | — | — | — | **Não migrar** — fora de escopo (decisão TELAS_FALTANTES) |
| RTC | (todo o módulo) | ⊘ | — (não existe no legado pré-RTC) | tabelas RTC | — | — | **Greenfield** (LC 214/2025 começa 2026) |

## Resumo numérico

- **Migrado validado (✅):** ~14 entidades
- **Migrado com ressalva (🟡):** ~10 entidades
- **Parcial (⚠️):** 2 entidades (CP, conciliação)
- **A fazer (❌):** ~5 entidades (pedidos, comissões, notas recebidas, contas pagar, etc.)
- **Não migrar (⊘):** 5 entidades (CRM greenfield, RTC greenfield, log auditoria, status entrega catálogo, frota fora escopo)

## Critério "pronto para piloto"

Para iniciar piloto com **uma empresa** (Empório Wood, que tem o dump):

- [ ] Todas as ✅ permanecem ✅ após reprocessamento limpo
- [ ] Todas as 🟡 chegam a ≥ 99% (validar amostragem + soma financeira)
- [ ] CP, conciliação e patrimônio decididos: migrar ou recomeçar?
- [ ] CRM, RTC e auditoria começam vazios (esperado)

## Próximas ações (priorizadas)

1. Subir versão dos `.py` reconstrutores que ainda usam estrutura antiga (Tomathe vs Cordelê).
2. Implementar ETL faltantes: pedidos, notas recebidas, contas pagar/receber, caixa.
3. Conferir consolidação de exclusões (3 tabelas → 1 nova entidade).
4. Decidir sobre patrimônio: migrar histórico ou começar pelo saldo atual.
