# Relacionamentos cross-módulo

Mapa de **FKs e dependências de leitura** entre as ~70 tabelas do Cordelê. Use ao implementar um módulo BE para saber quais Feign clients criar e ao implementar o FE para saber qual lib consome qual.

## Princípios

1. **FK física** existe **apenas dentro do mesmo schema** (mesmo módulo, mesmo bounded context, mesma empresa).
2. **Referência cross-schema/cross-módulo** = **chamada de API** (Feign sync) ou **evento JMS** (async). Nunca JOIN físico.
3. **`cordele_global` → `emp_<x>`**: schema operacional referencia o global por chave lógica (ex.: `cliente.vendedor_responsavel_id` referencia `usuario.usuario_id` do global, mas é validado em código, não por FK).
4. **`emp_<x>` → `emp_<x>` (mesma empresa)**: FK física permitida e recomendada.

## Mapa de dependências (quem-precisa-de-quem)

```
                                       ┌─────────────┐
                                       │   IAM (G)   │
                                       │ usuario     │
                                       │ papel       │
                                       │ permissao   │
                                       │ usuario_emp │
                                       └──────┬──────┘
                                              │ (todos consomem para autorização)
              ┌───────────────────────────────┼───────────────────────────────┐
              │                               │                               │
              ▼                               ▼                               ▼
       ┌──────────┐                    ┌──────────┐                    ┌──────────┐
       │ CAD (E)  │                    │ COM (E)  │                    │ AUD (G)  │
       │ cliente  │◄───────────────────│ venda    │───────────────────►│ evento_  │
       │ produto  │ (Feign sync)       │ orcamento│ (event JMS)        │ audit    │
       │ fornec.  │                    │ pedido   │                    └──────────┘
       │ vendedor │                    └────┬─────┘
       └────┬─────┘                         │
            │                               │ (event: venda.confirmada)
            │ (Feign: GET produto/{id})     │
            │                               ▼
            │                         ┌──────────┐    ┌──────────┐    ┌──────────┐
            │                         │ FIS (E)  │    │ EST (E)  │    │ FIN (E)  │
            │                         │ nfe      │───►│ movimento│    │ titulo_  │
            │                         │ evento_  │    │ saldo    │    │ receber  │
            │                         │ sefaz    │    └──────────┘    └──────────┘
            │                         └────┬─────┘
            │                              │ (event: nfe.autorizada)
            │                              ▼
            │                         ┌──────────┐    ┌──────────┐
            │                         │ RTC (E)  │    │ LOG (E)  │
            │                         │ apuracao │    │ entrega  │
            │                         │ darf     │    │ frete    │
            │                         └────┬─────┘    └──────────┘
            │                              │ (consumes events RTC AA)
            │                              │
            ▼                              ▼
       ┌──────────┐                  ┌──────────┐
       │ CRM (E)  │                  │ FIN (E)  │
       │ lead     │                  │ split    │
       │ oport.   │─event.ganha────► │ payment  │
       │ tarefa   │                  └──────────┘
       └──────────┘
```

> Legenda: **(G)** = vive em `cordele_global` · **(E)** = vive em `emp_<x>` · **─►** = depende de · **◄──** = é referenciado por.

## Tabela: FK física por módulo

### CAD (intra-schema, intra-módulo)

| Tabela | FK |
|---|---|
| `produto.grupo_produto_id` | → `grupo_produto.id` |
| `produto.unidade_principal_id` | → `unidade_medida.id` |
| `cliente.vendedor_id` | → `vendedor.id` |
| `cliente.classificacao_id` | → `classificacao_cliente.id` |
| `vendedor.gerente_id` | → `gerente.id` |
| `vendedor.funcao_id` | → `funcao_vendedor.id` |
| `produto_fornecedor.produto_id` | → `produto.id` |
| `produto_fornecedor.fornecedor_id` | → `fornecedor.id` |
| `fornecedor_dados_bancarios.fornecedor_id` | → `fornecedor.id` |
| `fornecedor_centro_custo.fornecedor_id` | → `fornecedor.id` |
| `obra_projeto.cliente_id` | → `cliente.id` |

### COM (intra-empresa)

| Tabela | FK |
|---|---|
| `orcamento.cliente_id` | → `cliente.id` (CAD) |
| `orcamento.vendedor_id` | → `vendedor.id` (CAD) |
| `venda.orcamento_id` | → `orcamento.id` |
| `venda.cliente_id` | → `cliente.id` (CAD) |
| `venda.vendedor_id` | → `vendedor.id` (CAD) |
| `item_venda.venda_id` | → `venda.id` |
| `item_venda.produto_id` | → `produto.id` (CAD) |
| `pedido_venda.venda_id` | → `venda.id` |
| `comissao_calculada.venda_id` | → `venda.id` |
| `comissao_calculada.vendedor_id` | → `vendedor.id` (CAD) |

### FIS (intra-empresa + global para catálogos)

| Tabela | FK |
|---|---|
| `nfe.venda_id` | → `venda.id` (COM) |
| `item_nfe.nfe_id` | → `nfe.id` |
| `item_nfe.produto_id` | → `produto.id` (CAD) |
| `item_nfe.ncm_id` | (lógica) → `cordele_global.ncm.id` |
| `evento_sefaz.nfe_id` | → `nfe.id` |
| `nota_recebida.fornecedor_id` | → `fornecedor.id` (CAD) |
| `nota_recebida_item.nota_id` | → `nota_recebida.id` |

### RTC (intra-empresa + global para tabelas RTC + cross-refs em FIN)

| Tabela | FK |
|---|---|
| `apuracao_periodo.empresa_id` | (implícito pelo schema) |
| `debito_processado.periodo_id` | → `apuracao_periodo.id` |
| `debito_processado.nfe_id` | → `nfe.id` (FIS) |
| `credito_apropriado.periodo_id` | → `apuracao_periodo.id` |
| `credito_apropriado.nota_recebida_id` | → `nota_recebida.id` (FIS) |
| `darf.periodo_id` | → `apuracao_periodo.id` |
| `matriz_fiscal_rtc.cclasstrib_codigo` | (lógica) → `cordele_global.cclasstrib.codigo` |
| `evento_nfe_rtc.nfe_id` | → `nfe.id` (FIS) |

### FIN (intra-empresa, com cross-module via lógica)

| Tabela | FK |
|---|---|
| `titulo_receber.venda_id` | → `venda.id` (COM) |
| `titulo_receber.nfe_id` | → `nfe.id` (FIS) — nullable |
| `titulo_receber.cliente_id` | → `cliente.id` (CAD) |
| `titulo_pagar.fornecedor_id` | → `fornecedor.id` (CAD) |
| `titulo_pagar.nota_recebida_id` | → `nota_recebida.id` (FIS) — nullable |
| `titulo_pagar_rateio.titulo_id` | → `titulo_pagar.id` |
| `titulo_pagar_rateio.plano_contas_id` | → `plano_contas.id` |
| `titulo_pagar_rateio.centro_custo_id` | → `centro_custo.id` |
| `movimento_caixa.conta_id` | → `banco_conta.id` |
| `movimento_caixa.titulo_receber_id` | → `titulo_receber.id` — nullable |
| `cheque.titulo_id` | → `titulo_receber.id` ou `titulo_pagar.id` (polimórfico via `tipo`) |
| `conciliacao_par.movimento_caixa_id` | → `movimento_caixa.id` |
| `conciliacao_par.apuracao_credito_id` | → `credito_apropriado.id` (RTC) — nullable (modo tripartite) |

### EST (intra-empresa)

| Tabela | FK |
|---|---|
| `movimento_estoque.produto_id` | → `produto.id` (CAD) |
| `movimento_estoque.local_id` | → `local_estoque.id` (CAD) |
| `movimento_estoque.venda_id` | → `venda.id` (COM) — nullable |
| `movimento_estoque.nota_recebida_id` | → `nota_recebida.id` (FIS) — nullable |
| `transferencia_estoque_item.transferencia_id` | → `transferencia_estoque.id` |
| `transferencia_estoque.local_origem_id` | → `local_estoque.id` (CAD) |
| `transferencia_estoque.local_destino_id` | → `local_estoque.id` (CAD) |

### LOG (intra-empresa)

| Tabela | FK |
|---|---|
| `entrega.venda_id` | → `venda.id` (COM) |
| `entrega.nfe_id` | → `nfe.id` (FIS) |
| `entrega.transportadora_id` | → `transportadora.id` (CAD) |
| `frete.entrega_id` | → `entrega.id` |
| `rastreamento_evento.entrega_id` | → `entrega.id` |

## Feign Clients derivados (mapeamento)

| Cliente Feign | Provider | Quem usa |
|---|---|---|
| `CadClienteClient` | <service> | comercial, crm, financeiro |
| `CadProdutoClient` | <service> | comercial, estoque, fiscal, rtc |
| `CadFornecedorClient` | <service> | financeiro, fiscal, rtc |
| `ComVendaClient` | <service> | fiscal, financeiro, estoque, log |
| `FisNFeClient` | <service> | rtc, financeiro, log |
| `RtcApuracaoClient` | rtc-service | financeiro (conciliação tripartite) |
| `IamPolicyClient` | <service> | todos |
| `EstSaldoClient` | <service> | comercial (validação antes de venda) |

Registro completo: [[../../backend/standards/services-catalog]] §7.

## Eventos JMS (loose coupling)

| Evento | Producer | Consumers principais |
|---|---|---|
| `cordele.cadastro.cliente.criado` | cadastros | crm, comercial |
| `cordele.comercial.venda.confirmada` | comercial | fiscal, estoque, financeiro |
| `cordele.fiscal.nfe.autorizada` | fiscal | financeiro, estoque, logistica, rtc |
| `cordele.rtc.debito.processado` | rtc | financeiro, auditoria |
| `cordele.rtc.credito.apropriado` | rtc | financeiro, auditoria |
| `cordele.financeiro.titulo.pago` | financeiro | comercial, rtc (extinção de débito) |
| `cordele.estoque.movimento.registrado` | estoque | auditoria |
| `cordele.logistica.entrega.realizada` | logistica | comercial, auditoria |

Catálogo completo de eventos: [[../contratos/event-catalog]].

## Como ler este mapa

- **Implementando módulo BE novo (`/be-architect-vision <MOD>`)**: filtre por seu módulo na tabela "FK física" para saber suas tabelas, e use as colunas "(CAD)", "(COM)" etc. para identificar Feign Clients que você precisa declarar (`infrastructure/clients/`).
- **Implementando feature FE (`/fe-feature-architect-discover <MOD> <feature>`)**: olhe quais módulos seu feature toca e importe os SDKs gerados de `@cordele/shared/contracts/<modulo>`.
- **Definindo evento novo**: registre em [[../contratos/event-catalog]] **antes** de publicar — <service> precisa estar inscrito.

## Anti-patterns

- ❌ Adicionar FK cross-schema (`emp_x.venda.cliente_id` → `cordele_global.cliente`) — Postgres aceita, mas quebra o isolamento de empresa.
- ❌ JOIN explícito cross-empresa (`<empresa-schema-1>.venda` JOIN `emp_certa.cliente`) — só com `UNION ALL` consciente, **nunca** automático.
- ❌ Microserviço consultando schema/tabela de outro — sempre via Feign ou evento JMS.
- ❌ Hardcoded list de tabelas neste documento — atualizar conforme `sql/01_schema_novo.sql` evolui.

## Referências

- DDL canônico: `sql/01_schema_novo.sql`
- Schema global: [[cordele-global]]
- Template empresa: [[empresa]]
- Catálogo de serviços + Event Catalog: [[../../backend/standards/services-catalog]]
