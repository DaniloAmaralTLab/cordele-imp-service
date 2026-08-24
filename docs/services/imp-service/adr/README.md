# Architecture Decision Records — Import (IMP)

Local, service-level decisions for the **Import** bounded context (`imp-service`). Project-wide
decisions (hexagonal architecture, modular monolith, multi-tenancy) live in
`../../../adr/` and are referenced, not duplicated, here.

## Records on file

| Number | Record | Status | Subject |
|---|---|---|---|
| ADR-001 | [ADR-001-service-boundary](./ADR-001-service-boundary.md) | accepted | Import as a single bounded-context module, not decomposed nor independently deployed in the POC |
| ADR-002 | [ADR-002-manuscript-immutability-lossless-parse](./ADR-002-manuscript-immutability-lossless-parse.md) | accepted | Manuscript is immutable after import; parsing preserves unparsed segments verbatim (never alters or drops content) |

## Relations

- **ADR-001** depends on the project-level hexagonal (`../../../adr/ADR-001-hexagonal-node.md`) and
  modular-monolith (`../../../adr/ADR-002-modular-monolith.md`) decisions — it applies them to this
  context.
- **ADR-002** is this context's defining domain decision; it constrains the parser port contract and
  the persistence model (docs 04 and 05).
- Multi-tenancy for this context follows the shared decision
  (`../../../adr/ADR-003-multi-tenancy.md`); no local override.

## Process

Status values: `proposed` · `accepted` · `superseded by <file>`. An accepted record is never edited
to say something different — it is superseded by a new record that names it, so the reasoning chain
stays readable. Numbers are allocated on creation and never reused.
