# Approval Workflow — Aprovações por valor/papel

> Modelo de **aprovação em 2 etapas** para ações que excedem limite operacional do papel. Já presente no protótipo: Contas a Pagar com valor > limite → status "A aprovar" → gerente aprova/rejeita.

## Contexto

Algumas ações no Cordelê **não podem ser executadas direto pelo papel operacional**, mesmo que ele tenha a permissão básica:

- VENDEDOR pode criar venda, mas com **desconto acima de 10%** precisa aprovação do gerente.
- FINANCEIRO pode lançar título a pagar, mas valor **> R$ 5.000** precisa aprovação do gerente.
- FISCAL pode cancelar NFe **dentro de 24h**; depois disso só com aprovação do gerente.
- ADMIN pode reativar usuário inativo, mas usuário **inativo > 90 dias** precisa aprovação de outro ADMIN (4-eyes principle).

Essas regras estão dispersas em vários módulos. Este documento consolida o modelo.

## Cenários canônicos (já no protótipo)

### Cenário 1 — Conta a Pagar acima do limite (FIN)

**Protótipo:** Fase 2 / M H2 — `TP-2024-2001` aparece com status "A aprovar".

1. Usuário FINANCEIRO cria título com valor R$ 18.500 (> limite operador R$ 5.000).
2. Sistema cria registro `titulo_pagar` com status `A_APROVAR` em vez de `APROVADO`.
3. Sistema dispara evento `cordele.financeiro.aprovacao.solicitada` para tarefa do gerente.
4. Gerente vê na sua lista de pendências, abre o título.
5. Gerente clica "Aprovar" → status vira `APROVADO`, evento `cordele.financeiro.titulo-pagar.aprovado` é publicado.
6. Gerente clica "Rejeitar" → status `REJEITADO` + campo `motivo_rejeicao` preenchido.

### Cenário 2 — Desconto acima de 10% em venda (COM)

1. Vendedor cria venda com desconto 12% (> 10% limite vendedor).
2. Sistema cria `venda` com status `RASCUNHO` + flag `aprovacao_pendente=true`.
3. Vendedor pode salvar e enviar para aprovação, mas **não pode faturar**.
4. Gerente recebe notificação, vê desconto + justificativa, aprova ou negocia.

### Cenário 3 — Cancelamento de NFe fora do prazo (FIS)

1. NFe foi autorizada há 5 dias (SEFAZ aceita cancelamento em 24h).
2. Fiscal solicita cancelamento via "Cancelamento Extemporâneo".
3. Sistema bloqueia ação direta — exige aprovação do gerente + justificativa.
4. Após aprovação, sistema usa procedimento alternativo (CC-e ou ajuste contábil).

## Modelo de dados

Tabela canônica em cada `emp_<x>`:

```sql
CREATE TABLE workflow_aprovacao (
    aprovacao_id     UUID PRIMARY KEY,
    documento_tipo   VARCHAR(50) NOT NULL,    -- 'titulo_pagar', 'venda_desconto', 'nfe_cancelamento'
    documento_id     UUID NOT NULL,           -- FK polimórfica
    solicitante_id   UUID NOT NULL,           -- usuario_id
    solicitado_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
    motivo           TEXT,                    -- justificativa do solicitante
    papel_aprovador  VARCHAR(50) NOT NULL,    -- GERENTE, ADMIN, ...
    status           VARCHAR(20) NOT NULL,    -- PENDENTE, APROVADO, REJEITADO, EXPIRADO
    aprovador_id     UUID,                    -- preenchido na decisão
    decidido_em      TIMESTAMPTZ,
    motivo_decisao   TEXT,                    -- justificativa do aprovador
    expira_em        TIMESTAMPTZ,             -- pendência expira (auto-rejeita se passar)
    contexto         JSONB                    -- snapshot do estado relevante
);

CREATE INDEX idx_workflow_status_papel ON workflow_aprovacao(status, papel_aprovador) WHERE status='PENDENTE';
CREATE INDEX idx_workflow_documento ON workflow_aprovacao(documento_tipo, documento_id);
```

## Regras canônicas (limites por papel)

> Configuráveis por empresa via tabela `cordele_global.parametro_aprovacao`.

| Ação | Papel operacional | Limite | Aprovador | Justificativa exigida |
|---|---|---|---|---|
| **FIN — lançar título a pagar** | FINANCEIRO | R$ 5.000 | GERENTE | Sim |
| **FIN — pagar título** | FINANCEIRO | R$ 10.000 (independente do lançamento) | GERENTE | Sim |
| **FIN — estornar título já pago** | FINANCEIRO | sempre | GERENTE | Sim |
| **FIN — fechar caixa com diferença** | (operador) | diferença > R$ 50 | GERENTE | Sim |
| **COM — venda com desconto** | VENDEDOR | > 10% | GERENTE | Sim |
| **COM — venda acima de** | VENDEDOR | R$ 50.000 | GERENTE | Não |
| **COM — cancelar venda já faturada** | VENDEDOR | sempre | GERENTE | Sim |
| **FIS — cancelar NFe fora do prazo SEFAZ** | FISCAL | > 24h | GERENTE | Sim |
| **FIS — inutilizar faixa** | FISCAL | > 50 números | GERENTE | Sim |
| **CAD — alterar limite de crédito de cliente** | (operador) | aumento > R$ 10.000 | GERENTE | Sim |
| **CAD — desbloquear cliente bloqueado por inadimplência** | (operador) | sempre | FINANCEIRO + GERENTE | Sim |
| **EST — acerto de estoque (ajuste manual)** | ALMOXARIFE | qtd × valor > R$ 1.000 | GERENTE | Sim |
| **RTC — gerar PER/DCOMP (restituição)** | FINANCEIRO | valor > R$ 5.000 | GERENTE | Sim |
| **IAM — alterar papel de usuário** | ADMIN | sempre | outro ADMIN (4-eyes) | Sim |
| **IAM — reativar usuário inativo > 90d** | ADMIN | sempre | outro ADMIN (4-eyes) | Sim |
| **ADM — exportar dados em massa** | ADMIN | > 10.000 registros | outro ADMIN | Sim |

## Fluxo de implementação no service

```java
@Service
@Transactional
@RequiredArgsConstructor
public class LancarTituloPagarService {

    private final TituloPagarRepository repo;
    private final WorkflowAprovacaoService workflow;
    private final AccessContextHolder accessCtx;
    private final ParametroAprovacaoService params;
    public TituloPagar executar(LancarTituloPagarCommand cmd) {
        var limite = params.limiteFinanceiroLancamento(accessCtx.empresaId());  // R$ 5.000 default
        var titulo = TituloPagar.criar(cmd);
        if (cmd.valor().compareTo(limite) > 0
            && accessCtx.papel().equals("FINANCEIRO")) {  // GERENTE não precisa de aprovação
            titulo.marcarAprovacaoPendente();
            workflow.solicitar(
                "titulo_pagar",
                titulo.getId(),
                accessCtx.usuarioId(),
                "GERENTE",
                cmd.justificativa(),  // exigido
                Duration.ofDays(7),    // expira em 7d
                titulo.snapshot()
            );
        } else {
            titulo.marcarAprovado();
        }
        return repo.save(titulo);
    }
}
```

## Estados do `workflow_aprovacao`

```
        SOLICITAÇÃO
             │
             ▼
        PENDENTE ──────────────┐
        │   │   │              │
   aprovar  rejeitar     [timeout 7d]
        │   │              │
        ▼   ▼              ▼
   APROVADO REJEITADO   EXPIRADO
```

- **APROVADO** → ação efetivada; documento avança no fluxo.
- **REJEITADO** → solicitante notificado; pode reabrir após corrigir.
- **EXPIRADO** → equivale a rejeição automática; libera solicitar novamente.

## Notificações

Cada solicitação publica evento `cordele.<modulo>.aprovacao.solicitada` consumido pelo `<service>` (Tarefas & Agenda) e/ou notificações push:

```json
{
  "eventType": "cordele.financeiro.aprovacao.solicitada",
  "data": {
    "aprovacaoId": "uuid",
    "documentoTipo": "titulo_pagar",
    "documentoId": "uuid",
    "solicitante": { "id": "uuid", "nome": "Maria Costa" },
    "valorEnvolvido": 18500.00,
    "papelAprovador": "GERENTE",
    "motivo": "Compra emergencial peças máquina",
    "expiraEm": "2026-05-27T17:00:00-03:00"
  }
}
```

## UI no protótipo (referência)

- **Contas a Pagar** (Fase 2 H2) — coluna "Status" mostra "A aprovar" (badge amarelo); drawer tem aba "Aprovação" com banner sobre limite + botões Aprovar/Rejeitar.
- **Tarefas & Agenda** (Fase 4 F6) — gerente vê lista de pendências de aprovação cross-módulo.
- Cada módulo afetado deve ter o **mesmo padrão visual** de status (`A aprovar` / `Aprovada` / `Rejeitada`).

## Permissões correspondentes

| Permissão | Quem ganha |
|---|---|
| `fin.titulo-pagar.aprovar` | GERENTE, ADMIN |
| `com.venda.aprovar-desconto` | GERENTE, ADMIN |
| `fis.nfe.cancelar-extemporaneo` | GERENTE |
| `iam.usuario.alterar-papel` | ADMIN (mas precisa outro ADMIN para aprovar) |
| `adm.workflow.aprovar` | GERENTE, ADMIN (genérica — fallback) |

Catálogo completo: [[permissoes]].

## Anti-patterns

- ❌ Permitir que o solicitante seja o aprovador (mesmo usuário com múltiplos papéis) — sempre validar `solicitante_id != aprovador_id`.
- ❌ Aprovação sem motivo escrito — auditoria perde rastro do "por quê".
- ❌ Aprovação retroativa (após ação já feita) — defeats the purpose.
- ❌ Lista de pendências sem priorização — gerente abre 50 itens e perde o crítico.
- ❌ Bypass via API direta (`POST /titulo-pagar` com `status='APROVADO'`) — sempre via service que aplica o workflow.

## Roadmap (futuro, não MVP)

- Notificação real-time via WebSocket/SSE para o aprovador.
- Múltiplos aprovadores em paralelo (qualquer um aprova) ou serial (todos têm que aprovar).
- Delegação de aprovação durante férias do gerente.
- Cota de aprovação por gerente (não pode aprovar > R$ 100k/mês sem outro nível).

## Referências

- Modelo RBAC: [[modelo]]
- Permissões: [[permissoes]]
- Session policy: [[session-policy]]
- Event catalog (eventos de aprovação): [[../contratos/event-catalog]]
- Protótipo Contas a Pagar: `prototipo/prototype/screens11.jsx` §H2
