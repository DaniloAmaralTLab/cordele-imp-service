# EARS Notation — Authoring Guide

> Standard for writing **acceptance criteria** in service specs of
> Cordelê. EARS (Easy Approach to Requirements Syntax)
> turns testable statements into a small grammar Claude (and humans) can
> parse mechanically into Cucumber/JUnit tests.

---

## Why EARS

A service spec mixes two kinds of content:

1. **Narrative** — vision, problem statement, personas, MVP scope, out-of-scope, rationale, decisions. This stays prose. It is meant to be read by a human onboarding to the module.
2. **Acceptance criteria** — invariants, behavior contracts, principles, success signals, API behavior. This is what Claude turns into tests and code. EARS gives this content a uniform shape that survives copy-paste into prompts and grep into validators.

The goal is **not** to convert specs to formal language. It is to give the testable subset a stable phrasing so:

- `gere testes Cucumber para esta seção` produces consistent output
- `verifique que o controller emite @PreAuthorize` can be derived from a SHALL statement
- A reviewer can grep for `THE SYSTEM SHALL` to find every contract this module makes

---

## The 5 EARS patterns

Pick the smallest pattern that fits. Don't stack modifiers when one suffices.

### 1. Ubiquitous — always true

> **THE SYSTEM SHALL** `<response>`.

For invariants that hold under every circumstance the spec applies to.

```
THE SYSTEM SHALL persist every venda transition (PENDENTE → CONFIRMADA → CANCELADA)
   to the `historico_status_venda` table within the same transaction as the
   transition itself.
```

### 2. Event-driven — triggered by an action

> **WHEN** `<trigger>`, **THE SYSTEM SHALL** `<response>`.

For behavior that fires in response to an event, API call, or message arrival.

```
WHEN a venda transitions to CONFIRMADA,
   THE SYSTEM SHALL publish `cordele.comercial.venda.confirmada`
   AFTER_COMMIT to ActiveMQ.
```

```
WHEN a POST /vendas/{id}/confirmar request arrives,
   THE SYSTEM SHALL verify cliente status with CadastrosClienteClient
   BEFORE writing any persistence change.
```

### 3. State-driven — true while a condition holds

> **WHILE** `<state>`, **THE SYSTEM SHALL** `<response>`.

For behavior gated by a running condition (mode, status, flag).

```
WHILE the cadastros-service is unavailable (Feign circuit open),
   THE SYSTEM SHALL reject venda write operations with HTTP 503 and
   `com.cadastros.indisponivel` ProblemDetail.
```

### 4. Optional — only when a feature is enabled

> **WHERE** `<feature>`, **THE SYSTEM SHALL** `<response>`.

For behavior present only when an optional capability is configured.

```
WHERE multi_tenancy_mode == "multi-empresa",
   THE SYSTEM SHALL filter every JPA query by `tenant_id` from
   TenantContextHolder.
```

### 5. Unwanted — forbidden conditions

> **IF** `<undesired condition>`, **THEN THE SYSTEM SHALL** `<corrective response>`.

For error paths and forbidden states. Pair with an explicit error code or status.

```
IF a venda CANCELADA already has an authorized NF-e,
   THEN THE SYSTEM SHALL reject the cancellation with HTTP 409 and
   `com.venda.cancelamento-pos-nfe-emitida`.
```

```
IF TenantContextHolder yields no tenant for a request,
   THEN THE SYSTEM SHALL reject the request with HTTP 400 and
   `com.{{ multi_tenancy_term }}.fora-de-escopo`.
```

---

## When to use EARS

Use EARS in these spec sections:

- **Architectural Principles** — each principle is a rule. Either Ubiquitous or "IF ... THEN".
- **Success Signals** — observable invariants ("emit events", "respond within Xms"). Ubiquitous or Event-driven.
- **API contracts** — for every endpoint, list its behavioral guarantees: WHEN this request arrives, THE SYSTEM SHALL ...
- **Event contracts** — WHEN this event is consumed, THE SYSTEM SHALL ...
- **Error model** — IF this condition holds, THEN THE SYSTEM SHALL respond with X.
- **Security rules** — WHILE the user lacks role X, THE SYSTEM SHALL reject ...
- **Multi-tenancy rules** — WHERE multi-tenant mode, THE SYSTEM SHALL filter ...

## When NOT to use EARS

EARS damages readability when applied to content that is not testable:

- **Vision / Intent** — explaining *why* the service exists. Prose.
- **Problem Statement** — describing the legacy pain. Prose.
- **Personas** — describing users and their needs. Prose.
- **MVP Scope / Out of Scope** — a list of features, not invariants. Plain bullets.
- **Rationale / Trade-offs** — explaining *why a decision was made*. Prose with ADR links.
- **Glossary** — defining terms. Plain definitions.

A rule of thumb: if a reader could turn the sentence into a Cucumber `Then` step, write it as EARS. If they could not, write it as prose.

---

## Counter-examples (avoid)

```
THE SYSTEM SHALL be fast.                         ← not testable. Specify p95 latency.
WHEN something happens, the system reacts.        ← vague. Name the event and the response.
THE SYSTEM SHOULD handle errors gracefully.        ← SHOULD is non-normative. Use SHALL + IF for the failure path.
IF a request comes in, THEN process it.            ← describes happy path with unwanted-pattern. Use WHEN.
```

---

## Combining EARS with examples

EARS statements can be followed by a fenced code block showing the concrete shape. This pattern is encouraged:

```
WHEN a POST /vendas/{id}/confirmar request arrives,
   THE SYSTEM SHALL respond with 200 and the confirmed VendaSnapshot.

Example:
```json
{
  "id": "...",
  "status": "CONFIRMADA",
  "snapshot": { "..." }
}
```

The EARS sentence is the *contract*; the example is *illustration*.

---

## Authoring checklist

Before merging a spec section that claims to follow EARS:

- [ ] Every statement uses one of the 5 patterns explicitly (no "should", no "tries to", no "ideally")
- [ ] Each statement names a concrete subject (a service, a controller, a query) — not "the system" used abstractly
- [ ] Each statement is *grep-able* — searching `THE SYSTEM SHALL` finds it
- [ ] Each statement is *test-derivable* — a developer reading it can write the Cucumber/JUnit case without asking
- [ ] Error paths use IF/THEN with the explicit error code
- [ ] No EARS in pure narrative sections (Vision, Personas, Rationale)

---

## See also

- [`templates/operational/claude-folder/commands/be-architect-specs.md.j2`](../../../../operational/claude-folder/commands/be-architect-specs.md.j2) — instructs the agent to author acceptance criteria in EARS
- Evolution plan Tier 1.3 — rationale for adopting EARS in Cordelê
- Decision **D-057** in [`docs/techlab-architecture-plan-consolidation-v4.md`](../../../../../docs/techlab-architecture-plan-consolidation-v4.md) §3.10
