<!-- OUTPUT-SCHEMA
- Schema Strategy
- Initial Entities
- Migration Strategy
- Data Lifecycle
-->

# 05 — Persistence Model

**Module:** IMP — Importação · **Engine:** PostgreSQL 16 · **ORM:** Prisma

## Schema Strategy

Cordelê uses **schema-per-tenant** multi-tenancy (ADR-003; `multiTenancy.isolationStrategy =
schema-per-tenant`). Two schema classes:

- **`cordele_global`** — shared registry that is not tenant-specific: `Editora` (the tenant/publisher
  account) and platform-level users. Read by Import to resolve the owning tenant; not written here.
- **`emp_<slug>` (e.g. `emp_aetos`)** — one schema per publishing house, holding that tenant's
  editorial data. The `Manuscrito` table lives here.

Every Import query runs inside `EmpresaContext` (AsyncLocalStorage, RULE-07), which the Prisma
adapter uses to target the correct tenant schema. No manuscript row is reachable from another
tenant's context; the tenant is never taken from a caller-supplied field.

> Note: the BA framing describes the POC as single-tenant (ADR-005-poc-single-tenant), modelling
> `Editora` as a "simplified tenant". The authoritative control-plane decision is schema-per-tenant
> multi-empresa; this document follows the control plane. The reconciliation is tracked as an
> assumption in doc 06.

## Initial Entities

Owned by Import (in the tenant schema):

**`Manuscrito`** — immutable parsed manuscript (aggregate root)

| Field | Type | Notes |
|---|---|---|
| `id` | string (pk) | |
| `projetoId` | ref → `ProjetoEditorial` | project the manuscript belongs to |
| `nomeArquivo` | string | original filename |
| `formato` | enum `docx | markdown` | source format |
| `totalCapitulos` | int | derived from `estrutura` |
| `totalImagens` | int | derived from `estrutura` |
| `trechosNaoParseados` | int | count of unparsed segments |
| `estrutura` | json/text | serialized content tree (chapters → sections → paragraphs, images, unparsed segments) |
| `binarioStorageKey` | string | tenant-scoped reference to the original file in storage |
| `criadoEm` | datetime | import timestamp |

Referenced but **not owned** by Import (owned by PROJ / global): `ProjetoEditorial`, `Editora`.
Composition (COMP) and Publication (PUB) entities (`Metadados`, `ConfiguracaoLayout`, `Publicacao`)
are out of this context's scope.

The content-tree nodes (chapters, sections, paragraphs, images, unparsed segments) are serialized
inside `estrutura` in the POC rather than exploded into separate tables — the tree is read as a whole
by downstream contexts and the manuscript is immutable, so a document-style column is the simpler,
faithful model. Promotion to relational nodes is a post-POC option (doc 06).

## Migration Strategy

- Migrations via **`prisma migrate`** (`stack.migrationTool = prisma-migrate`), schema defined in
  `schema.prisma`. `migrationsLocation = per-service`: the `imp` context's models and migrations live
  with the service.
- Because tenant data is schema-per-tenant, migrations are applied per tenant schema (`emp_<slug>`)
  in addition to `cordele_global`; the tenant-provisioning routine replays the manuscript DDL into
  each new tenant schema. (Prisma's single-schema assumption is bridged by the tenant-schema
  targeting used at runtime; this is a shared platform concern noted for the scaffold/infra phase.)
- No Flyway, no Alembic — this is a Node/Prisma project.

## Data Lifecycle

- **Retention.** The original binary and the parsed `Manuscrito` are retained for the life of the
  editorial project. Manuscripts are immutable; corrections create new manuscripts, so history is
  naturally append-only.
- **Confidentiality (framing §2.7, LGPD).** Manuscripts may contain unpublished creative work.
  Binaries and extracted images are stored under tenant-scoped keys with access limited to the owning
  project; they are treated as sensitive data.
- **Deletion.** Removing a `ProjetoEditorial` (PROJ context) cascades to its manuscripts and their
  stored binaries/images; the deletion path and LGPD erasure request handling are a cross-context
  concern to be specified with PROJ (doc 06).
- **Archival.** Not in POC scope; production may move cold binaries to cheaper object-storage tiers
  behind `FileStoragePort` without touching the domain.
