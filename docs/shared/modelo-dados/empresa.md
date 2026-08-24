# Schema `emp_<empresa>` — Template Operacional

Este documento descreve o **template** de schema operacional, replicado 5× (uma por empresa do grupo).

## Schemas instanciados

| Schema | Empresa |
|---|---|
| `<empresa-schema-1>` | ST Wood |
| `<empresa-schema-2>` | Certa Madeiras |
| `<empresa-schema-3>` | Beludia |
| `<empresa-schema-4>` | Empório Wood (única com dump legado) |
| `<empresa-schema-5>` | Solução |

## Princípio

- **Mesma estrutura, dados isolados.** O DDL é idêntico nos 5 schemas; o que muda é o que entra (vendas, NFe, clientes específicos).
- Cada microserviço operacional usa `EmpresaContextHolder.require()` antes de tocar qualquer query, e o `MultiTenantConnectionProvider` do Hibernate executa `SET search_path TO emp_<id>, cordele_global, public` por conexão.
- Tabelas operacionais **nunca** levam `empresa_id` como FK — o schema já isola.

## Categorias e tabelas por módulo

### CAD — Cadastros mestres (do legado)

```
cliente                  -- pessoas físicas/jurídicas que compram da empresa
fornecedor               -- pessoas/empresas que vendem para nós (com rateio em CCs)
produto                  -- catálogo de produtos (com 8 abas: dados, grupos, fiscal, multi-unidade,
                            custo&preço, estoque por local, fornecedores, comissão)
produto_historico_preco  -- evolução de preço (auto-populado)
produto_custo_anterior   -- média ponderada anterior
produto_ultima_compra    -- snapshot da última compra
vendedor                 -- agentes comerciais com comissões (produto/lucro/variável)
gerente                  -- supervisores (relação com vendedor)
transportadora           -- com frota (placa, capacidade kg/m³, motorista)
obra_projeto             -- vinculado a cliente; agrupa vendas/orçamentos
grupo_produto            -- hierarquia: Grande Grupo / Grupo / Subgrupo
grupo_estoque            -- hierarquia paralela para classificação física
atributo_produto         -- marcas, cores, tamanhos, tipos, etiquetas
unidade_medida           -- M³, UN, KG, M², M, PC
local_estoque            -- depósitos por empresa (Galpão Principal, Filial, ...)
classificacao_cliente    -- A/B/C/D
setor_profissao          -- Construção Civil, Marcenaria, Engenheiro, Arquiteto
funcao_vendedor          -- Externo, Interno, Supervisor, Representante
origem_contato           -- Meta Ads, LinkedIn, Indicação, Feiras
concorrente              -- catálogo de monitoramento comercial
motivo                   -- justificativa para exclusão/desconto/devolução
```

### COM — Comercial

```
orcamento                -- proposta inicial (com itens, descontos)
proposta_comercial       -- evolução do orçamento, formal
venda                    -- documento de venda (gera NFe + título a receber)
item_venda               -- linhas de produto
pedido_venda             -- após faturamento, rastrear separação/envio
comissao_calculada       -- snapshot de comissão por venda × vendedor
historico_desconto       -- descontos anteriores aplicados ao cliente (I2)
historico_comissao       -- comissões anteriores do vendedor
```

### CRM — Pipeline comercial

```
lead                     -- contato inicial
oportunidade             -- lead qualificado
tarefa                   -- todo-list por oportunidade
interacao                -- timeline (ligação/email/whatsapp/visita)
funil                    -- pipeline genérico
estagio_funil            -- colunas configuráveis (com cor + probabilidade)
motivo_perda             -- catálogo de razões de perda
pos_venda                -- contato após venda (NPS, satisfação)
tag                      -- etiquetas livres
```

### FIS — Fiscal (regime legado, válido até 2033)

```
nfe                      -- NF-e modelo 55
nfce                     -- NFC-e modelo 65 (PDV)
cte                      -- Conhecimento de Transporte
item_nfe                 -- linhas
evento_sefaz             -- timeline de eventos (autorização, CC-e, cancelamento, contingência)
inutilizacao             -- inutilização de faixa
nota_recebida            -- NF de entrada (compra)
nota_recebida_item       -- conferência XML × esperado
grupo_tributacao         -- matriz fiscal (UF × Tipo Pessoa × CFOP × CST)
```

### RTC — Reforma Tributária (LC 214/2025)

```
apuracao_assistida_periodo -- período mensal (Em Andamento / Ajuste / Concluída)
debito_processado          -- débitos CBS/IBS computados pela AA
credito_apropriado         -- créditos liberados (quando débito do fornecedor é extinto)
credito_a_apropriar        -- créditos pendentes
pagamento_utilizado        -- Split Payment / RAD / PCONT / Crédito Básico
darf                       -- documentos de arrecadação
matriz_fiscal_rtc          -- matriz UF × cClassTrib × CST IBS/CBS × alíquotas
evento_nfe_rtc             -- 17 eventos novos (crédito presumido, imobilização, sucessão, ...)
divergencia_calculo        -- auditoria Tomathe × Calc. Oficial × AA
cadastro_cib               -- imóveis vinculados ao SINTER
```

### FIN — Financeiro

```
titulo_receber             -- contas a receber (com vinculação a venda + NFe)
titulo_pagar               -- contas a pagar (com rateio em plano de contas + CC)
movimento_caixa            -- entradas/saídas de qualquer conta
caixa_sessao               -- abertura/fechamento de PDV
caixa                      -- cadastro do caixa físico
transferencia_conta        -- entre contas bancárias/caixas
cheque                     -- próprios e de terceiros (em carteira/compensado/devolvido)
conciliacao_bancaria_par   -- match extrato × movimento_caixa × AA (tripartite)
banco_conta                -- conta bancária / cartão
forma_pagamento            -- catálogo (boleto, PIX, cartão, transferência, cheque, dinheiro)
patrimonio                 -- ativo imobilizado (imóveis, veículos, máquinas)
patrimonio_depreciacao     -- histórico anual
plano_contas               -- estendido do master (cordele_global)
centro_custo               -- idem
```

### EST — Estoque

```
movimento_estoque          -- toda entrada/saída (com origem: venda/compra/NF/ajuste/transferência)
saldo_estoque              -- snapshot por produto × local
transferencia_estoque      -- entre depósitos (com itens)
inventario                 -- contagem física
acerto_estoque             -- ajuste manual (com motivo + CC)
curva_abc                  -- classificação ABC por faturamento (I4)
```

### LOG — Logística

```
entrega                    -- vinculada à venda/NFe
rota                       -- agrupamento de entregas por motorista/veículo
motorista                  -- com CNH, categoria, validade
veiculo                    -- placa, capacidade, tipo
frete                      -- custo + status (cotação/coletado/em trânsito/entregue)
rastreamento_evento        -- timeline (com mapa)
status_entrega             -- catálogo (Aguardando/Em separação/Em rota/Entregue/Devolvido)
```

### Auditoria (espelho local opcional)

```
exclusao_documento         -- consolidado das 3 tab*excl do legado (vendas/itens/boletas)
                             campos: data, tipo (Venda/Detalhe/Boleta), doc, motivo, autor, valor
```

> A auditoria *consolidada* fica em `cordele_global.evento_auditoria`. Aqui é apenas o histórico de **exclusões internas** com mais detalhe operacional.

## Convenções específicas dos schemas `emp_*`

- **Sem `empresa_id`** em nenhuma tabela — o schema já isola.
- PKs: `BIGSERIAL` para documentos sequenciais (NFe, venda, título) · `UUID` para entidades de domínio com regras (cliente, produto, vendedor).
- Numeração de NFe: a SEFAZ exige sequência única por empresa × série; usar `sequence` Postgres por schema.
- Soft-delete: idem global (`ativo BOOLEAN`). Para exclusão "lógica auditável", **registrar em `exclusao_documento`** antes de marcar inativo.
- Timestamps padrão.

## Migrations

Vivem em `backend/cordele-migrations/src/main/resources/db/migration/empresa/V<N>__<modulo>_<descricao>.sql`.
**Rodam 1× por empresa** (loop sobre os 5 schemas `emp_*`). Exemplos:
- `V001__cad_cliente.sql`
- `V002__com_venda.sql`
- `V010__rtc_apuracao_assistida.sql`

O `cordele-migrations` lê `CORDELE_EMPRESAS=<tenant-id-1>,<tenant-id-2>,...` e aplica.

## Como adicionar uma empresa nova (operação futura)

1. Inserir em `cordele_global.empresa` com novo `empresa_id` (ex: `emp_novaunidade`).
2. Adicionar `novaunidade` ao env `CORDELE_EMPRESAS`.
3. Reiniciar `cordele-migrations` — vai criar o schema e rodar todas as Vs.
4. Associar usuários via `usuario_empresa`.
5. Configurar parâmetros (alíquotas, IE, plano de contas estendido).

## Anti-patterns

- ❌ Adicionar coluna `empresa_id` "para garantir" — quebra o conceito de schema-per-empresa.
- ❌ Cross-empresa join automático no Hibernate — sempre consulta explícita com `UNION ALL`.
- ❌ Esquecer `EmpresaContextHolder.require()` em application service (ArchUnit RULE-07 detecta).
- ❌ Hardcoded `'<empresa-schema-1>'` em código de produção — sempre via context.

## Referências

- DDL canônico: `sql/01_schema_novo.sql`
- ADR-001: [[../multi-empresa]]
- Backend hexagonal patterns: [[../../backend/standards/hexagonal-patterns]]
- Mapeamento legado → novo: [[../etl-legado/README]]
