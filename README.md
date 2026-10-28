# Cordelê — imp-service

Part of **Cordelê**, a B2B platform that turns manuscripts (DOCX / Markdown)
into valid ePub publications. The platform is split into four NestJS services:

| Service | Responsibility |
|---|---|
| imp-service  | Import DOCX/Markdown into a structured content tree; curation of unparsed segments |
| comp-service | Editorial metadata, layout configuration, cover, preview |
| pub-service  | Assemble and validate the ePub; publication history |
| proj-service | Editorial project lifecycle and status |

This repository contains **imp-service** only. Contracts of the services it talks to
live under `docs/services/*/contracts/`.

## Layout

```
services/imp-service/   NestJS service (hexagonal: src/modules, src/domain, src/infrastructure)
docs/            architecture: service spec, contracts, ADRs, standards, issues
```

## Setup (Node 22, pnpm)

```bash
pnpm install
pnpm --filter @cordele/imp-service prisma:generate
pnpm --filter @cordele/imp-service test        # Jest unit tests (no database needed)
pnpm --filter @cordele/imp-service typecheck
pnpm --filter @cordele/imp-service lint        # includes hexagonal boundary rules
```

Running the service itself needs PostgreSQL and an OIDC provider; see
`services/imp-service/README.md` and `services/imp-service/.env.example`.
