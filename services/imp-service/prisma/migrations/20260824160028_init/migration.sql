-- =============================================================================
-- Prisma migration: init
-- Service:   imp-service
-- Generated: 2026-08-24 by node-migration-generator.py (D-545)
-- Source:    imp-service/contracts/data-model.md (2 ```sql``` block(s))
--
-- GENERATED FILE. To change the DDL: edit contracts/data-model.md and re-run
--   python scripts/node-migration-generator.py stub --module <M> --name <name> --force
-- Then keep prisma/schema.prisma in sync via node-entity-generator.py.
-- =============================================================================

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
