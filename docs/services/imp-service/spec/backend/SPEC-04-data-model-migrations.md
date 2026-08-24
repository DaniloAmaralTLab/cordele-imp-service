# SPEC-04 — Data Model & Migrations

**Module:** IMP · **Refs:** `contracts/data-model.md`, shared `ADR-003-multi-tenancy.md`,
`adr/ADR-002-manuscript-immutability-lossless-parse.md`.

## Objetivo

Especificar a persistência do agregado `Manuscrito` (tabela `manuscrito` no schema do tenant) e a
estratégia de migração Prisma sob schema-per-tenant.

## Escopo

- **In:** DDL canônica (`data-model.md` §2.1); `estrutura` JSONB; `status` (D-B); `content_hash`; plano
  de migração; aplicação por schema de tenant.
- **Out:** shape do content tree (SPEC-03/api §6.2); tabelas de PROJ/global.

## Decisões técnicas

- `manuscrito` no schema `emp_<slug>`; PK UUID (`gen_random_uuid()`, core PG16).
- `estrutura JSONB NOT NULL` (document-style, A3). `status` default `'imported'` com CHECK do enum (D-B).
- FK `projeto_id → projeto_editorial ON DELETE CASCADE` (cascata LGPD); PROJ é dono da tabela.
- `content_hash CHAR(64)` indexado, **não-único** no MVP (dedupe reservado — SPEC-05).

## Implementação

- `prisma migrate` gera `schema.prisma` + `V0001__create_manuscrito` a partir dos blocos `sql`.
- Provisionamento de tenant replica a DDL em cada `emp_<slug>` (rotina compartilhada — gap A1, infra).
- Sem UPDATE exposto (imutabilidade); re-upload = novo INSERT.

## Casos de borda

- Formato/tamanho fora do domínio → rejeitados por CHECK (defesa em profundidade além do app).
- Deleção do projeto → cascade remove manuscritos; purge de binários/imagens fica no caminho de app
  (SPEC-06, coordenado com PROJ).

## Critérios de aceite (EARS)

- `IF formato ∉ {docx, markdown} OR tamanho_bytes ∉ (0, 52428800], THEN THE SYSTEM SHALL reject the row.`
- `IF status ∉ {imported, parsing, import_failed}, THEN THE SYSTEM SHALL reject the row.`
- `WHEN a ProjetoEditorial is deleted, THE SYSTEM SHALL cascade-delete its manuscritos.`
- `THE SYSTEM SHALL never issue an UPDATE against a manuscrito row (immutability).`
- `THE SYSTEM SHALL apply the manuscrito DDL to every tenant schema during provisioning.`
