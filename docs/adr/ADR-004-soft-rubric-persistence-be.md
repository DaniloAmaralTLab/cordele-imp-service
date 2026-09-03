# ADR-004 — Persistencia do Veredito Soft e Renormalizacao da Rubrica para Backend

**Status:** Aceito  
**Data:** 2026-09-02  
**Decisores:** Operador Cordelê  
**Contexto:** D-315/D-317 (rubrica de maturidade), D-624 (persistencia via `mark`)

---

## Contexto

O `scripts/validator-score.py` computa a rubrica de maturidade 30/30/20/10/10 de forma
deterministico-heuristica. Os 10 pontos de `soft` sao declarados `basis: "agent"` e
`needsAgentConfirm: true` por design (D-315/D-317 — "a linha que nao se cruza": o agente
julga o subjetivo, o script julga o objetivo).

Dois problemas bloqueavam o score final:

1. **Ausencia de persistencia:** nao havia subcomando para persistir o veredito do agente.
   Qualquer nota escrita no README evaporava na proxima chamada de `score` (que re-deriva
   tudo do zero), e o `total` ficava eternamente `provisional: true` com `soft.value: null`.

2. **Rubrica soft incorreta para backend:** a rubrica original listava `a11y + observability +
   multi-tenancy enforcement` como os tres eixos dos 10 soft. Acessibilidade (a11y) e uma
   dimensao de frontend/UI e nao se aplica a microservicos backend.

---

## Decisao 1 — Subcomando `soft` para persistencia do veredito

Adicionado o subcomando `validator-score.py soft` ao script existente, seguindo as mesmas
convencoes R3 (argparse subcommands, root walk-up, atomic write, mensagens `OK:` / `error:`,
exit 0/1/2).

### Assinatura

```bash
python scripts/validator-score.py soft \
  --issue <ISSUE_ID> \
  --value <0-10> \
  --rationale "<evidencia concreta>" \
  [--layer be|fe] \
  [--root PATH] \
  [--evaluated-by ACTOR]
```

### Formato do sidecar

O sidecar e escrito em `docs/architecture/backend/issues/<ISSUE>.soft.json` (ao lado do
arquivo de issue). Formato:

```json
{
  "issue": "COMP-001",
  "layer": "be",
  "softValue": 9,
  "rationale": "<evidencia auditavel>",
  "evaluatedAt": "2026-09-02T00:00:00Z",
  "evaluatedBy": "be-validator"
}
```

### Comportamento do `score` apos a mudanca

- `score` chama `_load_soft_sidecar(issue_file)` antes de computar.
- Quando o sidecar existe e `softValue` e um inteiro: `breakdown.soft.value` = valor
  persistido, `basis` = `"agent-persisted"`, `needsAgentConfirm` = `false`,
  `provisional` = `false`, `range` = `[total, total]`.
- Quando o sidecar nao existe: comportamento anterior preservado (`value: null`,
  `provisional: true`, `range` = `[det, det+10]`).

### Regra de nao-regressao

O `score` nunca sobrescreve o sidecar soft — apenas le. O sidecar persiste enquanto o
arquivo existir. Isso espelha o mecanismo do `mark` (D-624), que persiste confirmacoes
de checklist diretamente no markdown da issue para sobreviver a re-derivacoes.

---

## Decisao 2 — Renormalizacao da rubrica soft para `layer be`

Para `--layer be`, os 10 pontos de `soft` sao distribuidos exclusivamente entre:

| Eixo | Peso |
|---|---|
| Observabilidade | 5 pts |
| Enforcement multi-empresa (RULE-07) | 5 pts |

**a11y e removida para backend.** A dimensao a11y permanece para `--layer fe`.

### Eixos de avaliacao backend

**Observabilidade (5 pts):**
- CorrelationMiddleware (X-Correlation-Id gerado/propagado)
- RequestLoggerMiddleware (logs estruturados de request/response)
- ProblemJsonFilter (respostas de erro RFC 7807 com traceId)
- Health endpoints (readiness + liveness)
- Metricas operacionais (contadores, labels)

**Enforcement multi-empresa RULE-07 (5 pts):**
- EmpresaContextMiddleware (popula ALS antes de qualquer guard)
- PrismaEmpresaService / cliente-por-schema (search_path por empresa)
- Todos os repositorios usam `withCurrentTenant` (nunca bypassam o contexto)
- `withCurrentTenant` lanca excecao quando contexto ausente (fail-fast)
- Testes de isolamento cross-schema existem e passam

### Atualizacoes de artefatos

- `scripts/validator-score.py`: `cmd_score` gera `agentTodo` distinto por layer (be omite a11y).
- `.claude/commands/be-validator.md`: secoes "Score de maturidade" e descricao do `soft` atualizadas.

---

## Nota de portabilidade (OBRIGATORIA)

`scripts/` e o fechamento transitivo copiado de `techlab-architecture` (D-406/D-577/D-579)
e sera sobrescrito na proxima geracao de scaffold. As mudancas deste ADR **precisam ser
portadas para o control plane** antes de qualquer execucao de scaffold que regenere:

- `scripts/validator-score.py`
- `.claude/commands/be-validator.md`

Artefatos afetados no control plane: `techlab-architecture/scripts/validator-score.py`,
`techlab-architecture/commands/be-validator.md`.

### Correcao adicional: gates-run.py -- resolucao de executavel no Windows (2026-09-02)

`scripts/gates-run.py` `_subprocess_runner` foi corrigido neste repositorio para resolver o
executavel via `shutil.which()` antes de chamar `subprocess.run`. No Windows, `pnpm` e `npx`
sao wrappers `.CMD`; sem a resolucao previa, `subprocess.run(["pnpm", ...])` lancava
`FileNotFoundError`, que o script convertia silenciosamente em veredito `"skip"` —
violando o principio "a gate that cannot verify fails loudly, never passes in silence".

**A correcao tambem precisa ser portada para `techlab-architecture/scripts/gates-run.py`**
antes de qualquer geracao de scaffold que regenere este arquivo.

Mudanca cirurgica em `_subprocess_runner` (linha ~210):
- Antes: `subprocess.run(cmd, ...)` capturava `FileNotFoundError` → `found=False` → `"skip"`
- Depois: `shutil.which(cmd[0])` → `None` = ausencia real (`"skip"`); path resolvido usado
  no `subprocess.run`; falha de lancamento apos resolucao → `(1, True, msg)` → `"fail"` visivel.

Comportamento em Linux/macOS: identico ao anterior (`shutil.which` encontra o mesmo caminho
que o shell usaria).

---

## Consequencias

**Positivas:**
- Score COMP (e qualquer modulo BE com soft avaliado) passa de `provisional: true` para
  definitivo, com `range` colapsado e `total` incluindo os 10 soft.
- `agentTodo` para backend nao pede mais avaliacao de a11y (reducao de ruido).
- O veredito soft e auditavel: timestamp, rationale, evaluatedBy registrados no sidecar.

**Negativas / riscos:**
- O sidecar precisa de curadoria manual quando a implementacao regride em observabilidade
  ou multi-empresa (o score nao detecta regressao automaticamente — o sidecar persiste).
- Mitigacao: o `rationale` deve citar evidencia especifica (middleware registrado, teste
  de isolamento) de forma que revisoes futuras possam detectar inconsistencia.

**Sem impacto:**
- Os pesos das 5 dimensoes da rubrica (30/30/20/10/10) nao mudam.
- Os subcomandos existentes (`score`, `checklist`, `mark`) permanecem identicos.
- `validator-decide.py` e `autopilot-state.py` consumem `state.json` — o campo
  `score.total` agora inclui o soft quando persistido, o que e o comportamento correto.
