# Import (IMP) — Structured Brief

Source of truth for the Specs, Backlog and Scaffold phases. Derived from the techlab-ba handoff
(`technical-framing.md`, `wireframe.md`, `data-model.json`, `constraints.md`) and
`project-context.json`.

| # | Item | Answer |
|---|---|---|
| 1 | Canonical name / prefix | `imp` / **IMP** — Importação (Import) |
| 2 | Problem it solves | Independent publishers hand off manuscripts as DOCX or Markdown and re-diagram each by hand to reach a distributable book. Import deterministically converts both into one canonical, structured content tree so downstream contexts never touch the raw file again — without ever altering the author's content. |
| 3 | Primary / secondary persona | Primary: Coordenador(a) Editorial (Marina, Editora Aetós pilot). Secondary: internal dev team integrating COMP/PUB against the content tree. |
| 4 | MVP slice | Upload DOCX/Markdown (≤ 50 MB) via BFF → deterministic parse (mammoth/remark) into content tree (chapters/sections/paragraphs/images) → detect & preserve unparsed segments → extract images → persist immutable `Manuscrito` → emit `ManuscriptImported`. |
| 5 | Out of MVP scope | Text editing; metadata/layout (COMP); ePub/PDF build & epubcheck (PUB); project lifecycle/history (PROJ); formats beyond DOCX/Markdown; complex tables/equations/nested footnotes (become unparsed segments); any AI. |
| 6 | Mandatory external integrations | File storage (local disk POC / S3-compatible prod) behind `FileStoragePort`. No third-party API, no broker, no AI provider. |
| 7 | Hub / TechLab AI dependencies · inter-module events | None — `ai.hasAi = false`, no hub service. Messaging disabled (`messaging.enabled = false`): the anchor event `ManuscriptImported` is dispatched **in-process** (NestJS event emitter), consumed within the monolith (e.g. PROJ advances project status). |
| 8 | Domain anchor event | **`ManuscriptImported`** (Manuscrito importado) — a new immutable manuscript with its content tree has been persisted. |

## Fixed facts (control plane + BA)

- **Stack:** Node 22 · NestJS 11.x · pnpm · Prisma + `prisma migrate` · PostgreSQL 16 · package base `@cordele`. No Java/Spring (TECH-001).
- **Architecture:** hexagonal (shared ADR-001-hexagonal-node) inside a modular monolith (shared ADR-002-modular-monolith).
- **Multi-tenancy:** `multi-empresa`, schema-per-tenant (shared ADR-003-multi-tenancy) — `cordele_global` + `emp_<slug>`; `EmpresaContext` (AsyncLocalStorage, RULE-07). BA POC single-tenant (ADR-005) is the one-tenant special case.
- **Owned aggregate:** `Manuscrito` (immutable; `estrutura` content tree, counts, `binarioStorageKey`). References `ProjetoEditorial` / `Editora` (owned by PROJ / global).
- **Core promise:** the system never alters author content; unparsed segments are preserved and reported (framing §2.1, §2.5).

## Local ADRs

- ADR-001 — Import as a single bounded-context module (single service, not decomposed in POC).
- ADR-002 — Manuscript immutability and lossless parse (critical domain decision).
