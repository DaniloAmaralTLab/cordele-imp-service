# SPEC-06 — Security & Confidentiality

**Module:** IMP · **Refs:** shared `ADR-003-multi-tenancy.md`, `contracts/api-contract.md` §2,
doc 02 §Cross-cutting (framing §2.7 / LGPD), `docs/architecture/backend/standards/rbac.md`.

## Objetivo

Especificar autenticação, autorização, isolamento de tenant, e confidencialidade dos manuscritos (obra
inédita — dado sensível, LGPD).

## Escopo

- **In:** OAuth2/JWT + scopes; tenant por `EmpresaContext`; chaves de storage tenant-scoped; validação de
  upload (anti-abuso); erasure/LGPD (coordenação com PROJ).
- **Out:** provisionamento de identidade (plataforma); mTLS interno (monólito, não aplicável ao POC).

## Decisões técnicas

- **AuthN:** Bearer JWT; validação via `OAUTH2_JWK_SET_URI`.
- **AuthZ:** scopes `imp:write` (upload), `imp:read` (leituras).
- **Tenant:** derivado do claim `empresa` do JWT (RULE-07); **nunca** de path/query/body.
- **Confidencialidade:** binário/imagens sob chave `emp_<slug>/manuscritos/<id>/...`; `binario_storage_key`
  nunca exposto na API.

## Implementação

- Guard JWT + scope no `ImpController`. `EmpresaContext` middleware popula o tenant antes do use case.
- Validação de upload **antes** de qualquer side-effect: formato, tamanho (50 MB), e defesa contra
  arquivo malicioso (adapter de malware-scan futuro atrás de `FileStoragePort` — doc 06 R4).
- **LGPD erasure:** deleção do `ProjetoEditorial` (PROJ) → cascade DB + purge de storage keys via
  `FileStoragePort` no caminho de deleção de app (cross-context com PROJ; contrato a fechar — doc 06).

## Casos de borda

- Token válido sem scope → 403. Sem token → 401. Recurso de outro tenant → 404 (não 403, evita
  enumeração cross-tenant).
- Upload de DOCX com macros / zip bomb → rejeitado por tamanho/formato; scan futuro no adapter.

## Critérios de aceite (EARS)

- `IF a request lacks a valid token, THEN THE SYSTEM SHALL respond 401.`
- `IF a valid token lacks the required scope, THEN THE SYSTEM SHALL respond 403.`
- `THE SYSTEM SHALL resolve the tenant only from the JWT empresa claim and reject any caller-supplied
  tenant identifier.`
- `IF a caller references a resource of another empresa, THEN THE SYSTEM SHALL respond 404.`
- `THE SYSTEM SHALL store binaries/images under tenant-scoped keys and never expose binario_storage_key.`
- `WHEN a ProjetoEditorial is erased (LGPD), THE SYSTEM SHALL remove its manuscritos and purge their
  stored binaries/images.`
