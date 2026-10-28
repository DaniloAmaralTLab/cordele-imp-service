# Cordelê — imp-service

Part of **Cordelê**, a B2B platform that turns manuscripts (DOCX / Markdown)
into valid ePub publications. The platform is split into four NestJS services:

| Service | Responsibility |
|---|---|
| imp-service  | Import DOCX/Markdown into a structured content tree; curation of unparsed segments |
| comp-service | Editorial metadata, layout configuration, cover, preview |
| pub-service  | Assemble and validate the ePub; publication history |
| proj-service | Editorial project lifecycle and status |

This repository contains **imp-service** only. Its HTTP API is described in
`docs/services/imp-service/contracts/api-contract.md`.

## Layout

```
src/modules/          NestJS feature modules: controllers, DTOs, use cases
src/domain/           entities, value objects, ports — no framework imports
src/infrastructure/   Prisma repositories, HTTP adapters, auth
prisma/               schema and migrations
docs/                 API contract and a couple of open issues
```

## Development (Node 22)

```bash
npm install
npm run prisma:generate
npm test              # Jest unit tests
npm run typecheck
npm run lint          # includes the hexagonal boundary rules
```

Running the service needs PostgreSQL and an OIDC provider; see `.env.example`.

## License

MIT — see [LICENSE](LICENSE).
