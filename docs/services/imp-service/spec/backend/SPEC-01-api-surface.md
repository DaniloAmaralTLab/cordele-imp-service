# SPEC-01 — API Surface

**Module:** IMP · **Refs:** `contracts/api-contract.md`, shared ADR `ADR-001-hexagonal-node.md`.
EARS per `docs/architecture/backend/standards/ears-notation.md`.

## Objetivo

Definir a superfície HTTP do `imp-service` sob `/api/imp`, servida pelo BFF, com parse **síncrono**
(decisão D-A) e binding de projeto **inequívoco** (decisão D-C).

## Escopo

- **In:** upload+parse síncrono; leitura de manuscrito; leitura do content tree; histórico por projeto.
- **Out:** edição de texto (não existe); metadados/layout (COMP); ePub (PUB); ciclo de vida do projeto
  (PROJ). Nenhum endpoint de polling / status de parse (D-A).

## Decisões técnicas

- Parse síncrono → `201 Created` com `ManuscritoDetail` completo (ADR local -002; doc 04).
- `ProjetoEditorial` via `projetoTitulo` (cria pela porta PROJ) **ou** `projetoId` (existente) — D-C.
- Tenant sempre do claim JWT via `EmpresaContext` (ADR-003, RULE-07).

## Implementação

Endpoints (contrato completo em `api-contract.md` §4):

| Verbo | Path | Scope | Sucesso |
|---|---|---|---|
| POST | `/api/imp/manuscripts` | `imp:write` | 201 `ManuscritoDetail` |
| GET | `/api/imp/manuscripts/{id}` | `imp:read` | 200 `ManuscritoDetail` |
| GET | `/api/imp/manuscripts/{id}/estrutura` | `imp:read` | 200 `ContentTree` |
| GET | `/api/imp/projetos/{projetoId}/manuscritos` | `imp:read` | 200 `ManuscritoSummary[]` |

## Casos de borda

- Nenhum/ambos de `projetoId`/`projetoTitulo` → 400. Formato inválido → 415. > 50 MB → 413.
- Recurso de outro tenant → 404 (nunca revela existência cross-tenant).

## Critérios de aceite (EARS)

- `WHEN a supported file with a valid project binding is POSTed, THE SYSTEM SHALL respond 201 with the
  full ManuscritoDetail (estrutura included, status="imported").`
- `THE SYSTEM SHALL NOT expose any parse-status/polling endpoint or parseJobId` (D-A).
- `IF the request supplies neither or both project bindings, THEN THE SYSTEM SHALL respond 400.`
- `THE SYSTEM SHALL resolve the tenant exclusively from the JWT empresa claim.`
- `IF a manuscritoId/projetoId belongs to another empresa, THEN THE SYSTEM SHALL respond 404.`
