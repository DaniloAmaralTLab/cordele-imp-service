# Service Spec Authoring (Cordelê Backend)

> Process and conventions for writing the backend technical specifications of any
> microservice.

Use this file when you need to specify a new service (e.g. starting `crm-service`)
or to refine the spec of an existing one (e.g. a new feature in `<service-name>`).

---

## Authoring Pipeline (3 phases)

```
Phase 1 -- Analysis of the architectural artifacts
  └── Read ADRs + data model + prototype + legacy mapping

Phase 2 -- Spec plan generation
  └── List every SPEC to produce, its dependencies and the order

Phase 3 -- Individual spec generation
  └── Create each SPEC under docs/architecture/backend/services/<service>/
```

Cordelê simplifies the Hub-standard process: it does not require 35 PlantUML diagrams per service,
but it keeps the rigor of SPECs that are implementable without ambiguity.

---

## Phase 1 -- Analysis of the architectural artifacts

### 1.1 Mandatory artifacts to read

| File | What to extract |
|---|---|
| `docs/architecture/shared/blueprint-core.md` | Mental model, layers, service responsibility |
| `docs/architecture/shared/multi-empresa.md` | ADR-001 schema-per-empresa (always relevant) |
| `docs/architecture/shared/modelo-dados/README.md` | DDL index; focus on the module tables |
| `sql/01_schema_novo.sql` | Canonical Postgres DDL of the module |
| `docs/architecture/backend/standards/services-catalog.md` | Canonical package + service responsibilities |
| `MAPEAMENTO_DADOS_LEGADO.md` (root) | Legacy -> new mapping (module tables) |
| `MODELO_DADOS.md` (root) | Conceptual model narrative |
| `prototipo-canonico` (memory) + `prototipo-padroes-telas` | UI patterns the BE feeds |
| `TELAS_FALTANTES.md` | Screens (and therefore endpoints) that must exist |

### 1.2 What to identify during the analysis

- **Root aggregate** of the domain and its value objects.
- **Lifecycle states** (state machine, when applicable).
- **External ports/adapters** (SEFAZ, bank, e-mail, payment gateway).
- **Cross-cutting domain services** (idempotency, tax validation).
- **Multi-empresa:** which tables live in `<empresa-schemas>` vs `cordele_global`.
- **Events produced and consumed** (catalog in `services-catalog.md`).
- **Feign clients** required (catalog in `services-catalog.md`).
- **Open dependencies** (DEP-XX) that need confirmation before implementation.

### 1.3 Flagging open dependencies

During the analysis, track every piece of information that needs external confirmation:

```
DEP-01 -- [Description] -- [Who confirms it] -- [Impact on the specs]
```

They show up as `> **DEP-XX:**` notes in the specs that reference them.

---

## Phase 2 -- Spec Plan

### 2.1 Location

```
docs/architecture/backend/services/<service>/plano-spec.md
```

### 2.2 Mandatory structure

```markdown
# Spec Plan -- <service-name>

## 1. SPEC list
| ID     | Title                               | Inputs                | Outputs                  | Dependencies |
|--------|-------------------------------------|-----------------------|--------------------------|--------------|
| SPEC-01| API Surface                         | --                    | endpoints REST           | SPEC-04, SPEC-08 |
| SPEC-02| Use cases (Application Services)    | SPEC-01               | application/service/*    | SPEC-03      |
| ...    | ...                                 | ...                   | ...                      | ...          |

## 2. Open dependencies
| DEP | Description | Affected specs | Impact |
|-----|-------------|----------------|---------|

## 3. Production sequence
Foundation (domain, state, validation) -> application -> infrastructure -> api -> BDD
```

### 2.3 Canonical Cordelê SPECs (8 + 1 optional)

Standard backbone -- adapt it to the domain. Specific services such as `<example-service-1>` may have
+1 SPEC dedicated to SEFAZ integration.

| SPEC | Title | Scope |
|---|---|---|
| **SPEC-01** | API Surface | HTTP endpoints, request/response contracts, status codes, permissions (`<modulo>.<recurso>.<acao>`) |
| **SPEC-02** | Domain Model | Root aggregate, value objects, enums, invariant rules |
| **SPEC-03** | Domain Services | Cross-entity rules, `DomainServiceConfig` |
| **SPEC-04** | Application Services | Use cases, sequences, transactions, EmpresaContextHolder.require() |
| **SPEC-05** | Persistence | JPA entities, adapters, custom queries, indexes |
| **SPEC-06** | Messaging | Events produced (envelope, queue, payload) + consumed (idempotency) |
| **SPEC-07** | External Integrations | Feign clients + Resilience4j; SEFAZ/bank/etc. integration when applicable |
| **SPEC-08** | BDD Test Scenarios | Gherkin scenarios: happy path, failures, idempotency, multi-empresa |

**Optional SPEC:**
- **SPEC-09 -- State Machine** (when the domain has a complex state machine: NFe, quote, CRM opportunity)

---

## Phase 3 -- Individual specs

### 3.1 Location

```
docs/architecture/backend/services/<service>/SPEC-{number}-{slug}.md
```

### 3.2 Naming

```
SPEC-{number}-{slug-kebab-case}.md
```

- Numbered by **production sequence** (dependencies first).
- Slug in kebab-case, at most 40 characters.

Examples:
```
SPEC-01-api-surface.md
SPEC-04-application-services.md
SPEC-08-bdd-scenarios.md
SPEC-09-state-machine-nfe.md
```

### 3.2.1 -- Reserved words in `generator-config.yml` (D-399)

The `generator-config.yml` file is read through `yaml.safe_load()` (PyYAML YAML 1.1). The
following words are parsed as **booleans** when they are not quoted:

| Unquoted word | Python value received |
|---|---|
| `on`, `yes`, `true` | `True` |
| `off`, `no`, `false` | `False` |

**Rule:** always use quoted strings for values that are not semantic booleans:

```yaml
# CORRECT
defaultState: "enabled"

# WRONG -- PyYAML reads True (Python bool); the generator emits "True" instead of "enabled"
defaultState: on
```

The `generator-config-gen.py validate` script detects a boolean `defaultState` and reports
the error with a fix hint (D-394). Canonical values: `"enabled"` or `"disabled"`.

---

### 3.3 Mandatory frontmatter

```yaml
---
document_type: backend-spec
document_id: <service>-spec-{number}-{slug}
title: SPEC-{number} -- {Title} -- <service-name>
owner: Tech Lead / Architecture
status: draft
language: en-US
scope: <service>-mvp
last_updated: {YYYY-MM-DD}
---
```

### 3.4 Standard internal structure

```markdown
# SPEC-{number} -- {Title}

## 1. Goal
[One to three sentences: what this spec specifies and why it exists]

## 2. [Main technical content]
[Tables, contracts, rules, sequences -- specific to each spec]

## 3. [Complementary sections]
...

## N-1. Multi-empresa
[How this spec handles EmpresaContextHolder; which tables in <empresa-schemas> vs cordele_global]

## N. Dependencies
- **SPEC-XX** -- [what this spec needs from that one]
- **DEP-XX** -- [external information to confirm]
```

The **Dependencies** section is always the last one.

### 3.5 Content conventions by type

**Interface contracts (ports, use cases):**

```
Interface: PortName

method(input: InputType, context: EmpresaContext) : OutputType
  -> Step 1: what it does
  -> Step 2: what it returns
  -> On failure: exception thrown
```

**Field mapping tables:**

```markdown
| Input field (request) | Intermediate field (domain) | Persisted field (JPA) | Required |
```

**Execution sequences (use cases):**

```
1. EmpresaContextHolder.require()
2. FirstStep.action(params)
     -> If condition: do X
     -> If another condition: do Y
3. SecondStep.action(params)
```

**Failure/compensation tables:**

```markdown
| Failing step | Action | Final state |
```

**Validation catalogs:**

```markdown
| Code | Field | Rule | Severity (BLOCKING|WARNING) |
```

**BDD scenarios (SPEC-08):**

```gherkin
# language: en
Feature: [Flow name]

  Background:
    Given [precondition: active empresa, authenticated user]
  Scenario: [Expected outcome]
    Given [initial state]
    When [action executed]
    Then [verifiable assertions]
    And [additional assertions]
```

---

## SPEC quality rules

### Q1 -- Every spec implementable without ambiguity

- Class, method and field names = the same ones the code will use.
- Explicit types (`String`, `UUID`, `Instant`, `List<X>`, `BigDecimal`, etc.).
- Enums list every valid value.
- Deterministic conditional rules (no "maybe", no "it depends").

### Q2 -- Open dependencies made explicit

When a piece of information is not available:

```markdown
> **DEP-XX:** [Description of what is missing and who confirms it]
```

Never invent values -- mark a DEP-XX and continue with explicit placeholders.

### Q3 -- Isolation between specs

Each spec specifies **one layer or capability**. Do not duplicate:
- Validation rules -> SPEC-02 (Domain Model) or SPEC-03 (Domain Services)
- State transitions -> SPEC-09 (State Machine, optional)
- DDL and indexes -> sql/01_schema_novo.sql (reference it -- do not duplicate)
- Auth/authz -> SPEC-01 (permission keys) + the global `rbac.md`

When a spec needs to reference something from another, use `(see SPEC-XX)` or `(see rbac.md section X)`.

### Q4 -- Specs are the source of truth

Contracts in the specs (port interfaces, DTO structure, use-case sequences) take
precedence over ad hoc conventions. Code must conform to the specs, not the other way around.

### Q5 -- Multi-empresa always explicit

Every spec touching empresa data must declare:
- Which tables live in `<empresa-schemas>` vs `cordele_global`.
- Where `EmpresaContextHolder.require()` is called.
- How the cross-empresa guard is applied (when there is a child aggregate).

---

## Diagrams (optional, focused)

Cordelê does not require 35 PlantUML diagrams per service (as Hub does). Diagrams are **optional**
but recommended for services with high complexity (`<example-service-1>`, `<example-service-2>`).

Location: `docs/architecture/backend/services/<service>/diagrams/`

Recommended minimum catalog (~7 diagrams, optional):
- 1 C4 component (overview)
- 1 aggregate + value objects
- 1-3 sequence (happy path + 1-2 failures)
- 1 state machine (if there is one)
- 1 ERD (extracted from `sql/01_schema_novo.sql`)

Use PlantUML with a consistent palette (to be defined in the visual ADR-002 when the first
service is documented).

---

## Completion checklist

Before considering the backend SPEC of a service done:

- [ ] `plano-spec.md` plan generated with the full SPEC list + open dependencies
- [ ] SPEC-01 (API Surface) covers every endpoint with complete contracts
- [ ] SPEC-02/03 (Domain) covers aggregate, value objects, enums and invariant rules
- [ ] SPEC-04 (Application) lists every use case with sequences + EmpresaContextHolder.require()
- [ ] SPEC-05 (Persistence) references the DDL in `sql/01_schema_novo.sql` (does not duplicate it)
- [ ] SPEC-06 (Messaging) lists events produced + consumed (aligned with `services-catalog.md` section 6)
- [ ] SPEC-07 (External) covers Feign clients + Resilience4j (aligned with `services-catalog.md` section 7)
- [ ] SPEC-08 (BDD) includes scenarios: happy path, each typical failure, idempotency, empresa isolation
- [ ] SPEC-09 (State Machine) when applicable
- [ ] No invented information -- every uncertainty marked as DEP-XX
- [ ] Permissions named in the `<modulo>.<recurso>.<acao>` pattern (aligned with `rbac.md`)
- [ ] Multi-empresa made explicit in every SPEC touching empresa data

---

## References

- `services-catalog.md` -- microservice catalog + canonical packages + events
- `hexagonal-patterns.md` -- package structure and rules
- `java-conventions.md` -- code conventions
- `platform-patterns.md` -- JMS, Feign, Flyway, MDC, Saga, multi-schema
- `testing-conventions.md` -- test pyramid
- `rbac.md` -- role and permission model
- `docs/architecture/shared/modelo-dados/README.md` -- DDL index
- `sql/01_schema_novo.sql` -- canonical DDL
