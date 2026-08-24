# Architecture Decision Records -- Backend

An ADR records **one** decision that shapes the backend of Cordelê: the forces
that made it necessary, the option taken, the options rejected and what the project now has to live
with. It is a historical record, not a manual -- prescriptive rules belong in `../standards/`.

## Format

Every record follows the same skeleton:

| Section | Purpose |
|---|---|
| Status | `proposed`, `accepted`, `superseded by <file>` -- plus the date |
| Scope | Which services, modules or stacks the decision binds |
| Context | The forces, constraints and failure modes that forced a choice |
| Decision | The option taken, stated as a rule someone can apply |
| Alternatives considered | What was rejected, and the reason it lost |
| Consequences | Positive and negative, including the mitigations accepted |
| References | Standards, external sources, related records |

An accepted ADR is never edited to say something different. It is superseded by a new record that
names it, so the reasoning chain stays readable.

## Numbering

Numbers are allocated when the record is created and are never reused. Stack-neutral decisions
occupy the low numbers in creation order.

**Stack-variant records are numbered at render time (D-563).** A project holds one hexagonal-
architecture record per backend language in use, and their natural numbers collide. The base stack
(Java) keeps the historical numbers; in a **hybrid project every non-base stack is reallocated from
the reserved block starting at 010**. Never cite one of these records by a number typed by hand --
read the index below, or use the `adr_file` reference emitted by the generator.

## Records on file

| Number | Record | Subject |
|---|---|---|
| ADR-001 | [[./ADR-001-hexagonal-node]] | Hexagonal Architecture (Node.js / NestJS) |
| ADR-002 | [[./ADR-002-modular-monolith]] | Modular monolith — one deployable, one `@Module` per bounded context |
| ADR-003 | [[./ADR-003-multi-tenancy]] | Schema-per-tenant isolation with EmpresaContext (RULE-07) |

Records without an entry above are stack-neutral: browse this directory for the full list.

## Adding a record

1. Take the next free number in this directory (see the numbering rule above).
2. Name the file `ADR-<NNN>-<kebab-subject>.md`.
3. Fill every section of the format table; an empty "Alternatives considered" means the decision
   was not one.
4. Add the record to the index above and link it from the standard it affects.
