# Data Model — imp-service (Importação)

**Module:** IMP · **Engine:** PostgreSQL 16 · **ORM:** Prisma (`prisma migrate`) · **Package base:** `@cordele`
**Governing ADRs:** shared `ADR-003-multi-tenancy.md` (schema-per-tenant), `ADR-002-modular-monolith.md`;
local `adr/ADR-002-manuscript-immutability-lossless-parse.md`.

The ` ```sql ` blocks below are the **canonical contract** consumed by `node-migration-generator.py`
(DDL → Prisma `schema.prisma` + initial migration) and `node-entity-generator.py`. Prose is for humans.

---

## 1. Conventions

- **PK strategy:** UUID v4, `id UUID NOT NULL DEFAULT gen_random_uuid()` (`gen_random_uuid()` is core in
  PostgreSQL 16 — no extension required).
- **Timestamps:** `TIMESTAMPTZ` in UTC; import time is `criado_em DEFAULT now()`.
- **No soft-delete for `Manuscrito`:** manuscripts are immutable (local ADR-002); corrections create a
  new row. Deletion happens only via cascade from `ProjetoEditorial` (LGPD erasure, §5).
- **Encoding:** UTF-8; text columns are `TEXT`; the content tree is `JSONB`.
- **Naming:** snake_case tables/columns; Prisma models map back to PascalCase / camelCase.
- **Tenancy:** every IMP table lives in the **tenant schema** (`emp_<slug>`, e.g. `emp_aetos`); none in
  `cordele_global`. The Prisma adapter targets the schema resolved from `EmpresaContext` (RULE-07).

## 2. Entities

### 2.1 `manuscrito` [empresa]

The immutable parsed manuscript — the aggregate root owned by Import. One row per successful upload.
The content tree (`estrutura`) is stored document-style as a single `JSONB` column (doc 05 / assumption
A3): it is read as a whole by downstream contexts and the manuscript is immutable, so exploding it into
relational node tables buys nothing in the POC. `status` exists to keep the post-POC async path open
without a breaking change (decision D-B); the MVP always writes `'imported'`. `content_hash` is stored
to **enable** future content-hash dedupe (idempotency, doc 06); it is not enforced unique in the MVP.

`projeto_id` references `projeto_editorial`, which is **owned by the PROJ context** (IMP never writes
it). The FK gives the LGPD deletion cascade (§5). The `projeto_editorial` table is provisioned by the
PROJ migration; in the shared monolith DB its DDL runs before IMP's.

```sql
-- schema: empresa
CREATE TABLE manuscrito (
    id                    UUID        NOT NULL DEFAULT gen_random_uuid(),
    projeto_id            UUID        NOT NULL,
    nome_arquivo          TEXT        NOT NULL,
    formato               TEXT        NOT NULL,
    status                TEXT        NOT NULL DEFAULT 'imported',
    total_capitulos       INTEGER     NOT NULL DEFAULT 0,
    total_imagens         INTEGER     NOT NULL DEFAULT 0,
    trechos_nao_parseados INTEGER     NOT NULL DEFAULT 0,
    estrutura             JSONB       NOT NULL,
    content_hash          CHAR(64),
    binario_storage_key   TEXT        NOT NULL,
    tamanho_bytes         BIGINT      NOT NULL,
    criado_em             TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (id),
    CONSTRAINT chk_manuscrito_formato CHECK (formato IN ('docx', 'markdown')),
    CONSTRAINT chk_manuscrito_status  CHECK (status IN ('imported', 'parsing', 'import_failed')),
    CONSTRAINT chk_manuscrito_counts  CHECK (total_capitulos >= 0 AND total_imagens >= 0 AND trechos_nao_parseados >= 0),
    CONSTRAINT chk_manuscrito_tamanho CHECK (tamanho_bytes > 0 AND tamanho_bytes <= 52428800),
    CONSTRAINT fk_manuscrito_projeto  FOREIGN KEY (projeto_id) REFERENCES projeto_editorial (id) ON DELETE CASCADE
);

CREATE INDEX idx_manuscrito_projeto      ON manuscrito (projeto_id);
CREATE INDEX idx_manuscrito_criado_em    ON manuscrito (criado_em DESC);
CREATE INDEX idx_manuscrito_content_hash ON manuscrito (content_hash);

COMMENT ON TABLE  manuscrito                       IS 'Immutable parsed manuscript (aggregate root, IMP context). estrutura holds the serialized content tree.';
COMMENT ON COLUMN manuscrito.status                IS 'imported (MVP terminal); parsing/import_failed reserved for post-POC async path (decision D-B).';
COMMENT ON COLUMN manuscrito.estrutura             IS 'Content tree JSONB — see api-contract.md §6.2 (ContentTree schema).';
COMMENT ON COLUMN manuscrito.content_hash          IS 'SHA-256 of the original binary; stored to enable optional future dedupe (not unique in MVP).';
COMMENT ON COLUMN manuscrito.binario_storage_key   IS 'Tenant-scoped storage key of the original file (never exposed via API).';
COMMENT ON COLUMN manuscrito.trechos_nao_parseados IS 'Honest count of unparsed segments preserved in estrutura (lossless-by-disclosure, ADR-002).';
```

**Invariants:**

- `IF formato is not in {docx, markdown}, THEN THE SYSTEM SHALL reject the row (CHECK chk_manuscrito_formato).`
- `IF tamanho_bytes is not in (0, 52428800], THEN THE SYSTEM SHALL reject the row (CHECK chk_manuscrito_tamanho).`
- `THE SYSTEM SHALL keep total_capitulos, total_imagens and trechos_nao_parseados consistent with
  estrutura` (application-enforced at import; counts derived from the tree, doc 03 invariant 6).
- `WHEN a ProjetoEditorial is deleted, THE SYSTEM SHALL cascade-delete its manuscritos` (FK ON DELETE
  CASCADE; binary/image erasure handled by the application deletion path, §5).
- `THE SYSTEM SHALL never update a manuscrito row after insert` (immutability; enforced in the
  application layer — no UPDATE path is exposed; a re-upload inserts a new row).

## 3. Content tree (`estrutura`) — reference

The JSON structure serialized in `manuscrito.estrutura` is formalized in
`contracts/api-contract.md` §6.2 (`ContentTree`) and its unparsed-segment taxonomy in §6.3. It is not
exploded into tables in the POC (assumption A3). Promotion to relational nodes is a post-POC option and
would arrive as new tables + a backfill migration, leaving `manuscrito` intact.

## 4. Relations

```
cordele_global                         emp_<slug>  (tenant schema)
+-------------+                        +--------------------------+
|  editora    |  1 ── owns ── *        |  projeto_editorial (PROJ)|
| (global,    |----------------------> |  id (pk)                 |
|  PROJ-owned)|                        +------------+-------------+
+-------------+                                     | 1
                                                    |
                                                    | owns / cascades
                                                    v *
                                        +--------------------------+
                                        |  manuscrito  (IMP-owned) |
                                        |  projeto_id  ── FK ──────>|
                                        +--------------------------+
```

`editora` (global) and `projeto_editorial` (tenant) are owned by PROJ/global; shown for context only —
IMP does not create them.

## 5. Data lifecycle & LGPD

- **Retention:** binary + parsed `manuscrito` retained for the life of the editorial project.
- **Deletion / erasure:** `ON DELETE CASCADE` removes manuscrito rows when the owning
  `projeto_editorial` is deleted. Stored binaries and extracted images are **not** in the DB; the
  application deletion path (triggered by the PROJ deletion, cross-context) must also purge the
  tenant-scoped storage keys via `FileStoragePort` (specified with PROJ — see `SPEC-06` and doc 06).
- **Confidentiality:** binaries/images are sensitive (unpublished creative work); stored under
  tenant-scoped keys, never exposed by the API.

## 6. Migration plan

- Tooling: **`prisma migrate`** (`migrationsLocation = per-service`). DDL above → `schema.prisma` models
  + the initial migration.
- **Reserved range:** `V0001__create_manuscrito` (initial). Subsequent IMP migrations continue
  `V0002__...` (e.g. a future unique index on `content_hash` if dedupe is turned on; relational
  content-tree tables if A3 is revisited).
- **Schema-per-tenant application:** the DDL is replayed into **every** tenant schema (`emp_<slug>`) by
  the shared tenant-provisioning routine, in addition to bootstrapping a new tenant. Prisma's
  single-schema assumption is bridged by runtime schema targeting (RULE-07) and the provisioning routine
  (shared platform concern — flagged for scaffold/infra, doc 06; gap A1).

## 7. Schema-level mapping

| Table | Schema class | Owner | Notes |
|---|---|---|---|
| `manuscrito` | `emp_<slug>` (tenant) | **IMP** | this contract |
| `projeto_editorial` | `emp_<slug>` (tenant) | PROJ | referenced (FK); not created here |
| `editora` | `cordele_global` | PROJ/global | referenced indirectly (tenant registry); not created here |

---

## 8. Addendum — `segmento_curadoria` (T04 editorial annotations, phase M4)

Editorial annotation table — mutable companion to the immutable `manuscrito`. Tracks editor
decisions on individual unparsed segments (ignore / restore). Does **not** mutate `estrutura`.

```sql
-- schema: empresa
CREATE TABLE segmento_curadoria (
    id             UUID        NOT NULL DEFAULT gen_random_uuid(),
    manuscrito_id  UUID        NOT NULL,
    segmento_id    TEXT        NOT NULL,
    acao           TEXT        NOT NULL DEFAULT 'ignorado',
    criado_por     TEXT        NOT NULL,
    criado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (id),
    CONSTRAINT chk_segmento_curadoria_acao CHECK (acao IN ('ignorado')),
    CONSTRAINT fk_segcur_manuscrito FOREIGN KEY (manuscrito_id) REFERENCES manuscrito (id) ON DELETE CASCADE,
    CONSTRAINT uq_segcur_manuscrito_segmento UNIQUE (manuscrito_id, segmento_id)
);

CREATE INDEX idx_segmento_curadoria_manuscrito ON segmento_curadoria (manuscrito_id);

COMMENT ON TABLE segmento_curadoria IS 'Editorial annotation: editor decision to ignore an UnparsedSegment. Mutable; does not alter manuscrito.estrutura (ADR-002).';
COMMENT ON COLUMN segmento_curadoria.segmento_id IS 'UnparsedSegment.id from ContentTree — not a FK (JSONB path); validated application-side.';
COMMENT ON COLUMN segmento_curadoria.acao IS 'Currently only ignorado; reserved for future annotation types.';
```

**Migration:** `V0002__create_segmento_curadoria`

**Invariants:**
- `UNIQUE (manuscrito_id, segmento_id)` enforces at-most-one annotation per segment (idempotency).
- `ON DELETE CASCADE` from `manuscrito`: annotations vanish with the manuscript.
- `segmento_id` is validated against `manuscrito.estrutura` by the application (not a DB FK into JSONB).
