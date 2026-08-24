# SPEC-10 — Integrations

**Module:** IMP · **Refs:** `contracts/integration-contracts.md`, `contracts/hub-integration.md`,
shared `ADR-001-hexagonal-node.md`.

## Objetivo

Especificar as integrações do IMP — todas atrás de ports (hexagonal): file storage, bibliotecas de
parse, e a dependência **in-process** de PROJ (D-C). Sem API de terceiros, sem broker, sem TechLab AI.

## Escopo

- **In:** `FileStoragePort`; `ManuscriptParserPort` (mammoth/remark); portas inbound de PROJ.
- **Out:** hub / TechLab AI (N/A — `hub-integration.md`).

## Decisões técnicas

- Cada integração é um adapter atrás de um port de domínio; o use case nunca nomeia a lib/adapter.
- **PROJ (D-C):** `CreateProjetoEditorialUseCase.create({titulo})` e `ProjetoEditorialLookup.exists(id)`
  injetadas por DI in-process; PROJ é dono exclusivo de `projeto_editorial`.
- Storage keys tenant-scoped; parsers determinísticos.

## Implementação

- Seleção de parser por `formato` atrás de `ManuscriptParserPort`.
- Falha de storage ou da porta PROJ → aborta o import (sem manuscrito); ProblemDetail apropriado.
- Stubs finos das portas de PROJ se PROJ for scaffoldado depois do IMP (nota de scaffold).

## Casos de borda

- `projetoTitulo` mas criação em PROJ falha → 422; nada persistido.
- `projetoId` inexistente na empresa ativa → 422 `projeto-not-found`.
- Imagem não resolvível pelo storage → import falha antes do commit.

## Critérios de aceite (EARS)

- `THE SYSTEM SHALL access file storage, parsers and PROJ only through domain ports.`
- `WHEN the upload carries projetoTitulo, THE SYSTEM SHALL create the project via the PROJ inbound port
  before parsing.`
- `WHEN the upload carries projetoId, THE SYSTEM SHALL validate it via the PROJ lookup within the active
  empresa.`
- `THE SYSTEM SHALL never write the projeto_editorial table directly.`
- `IF a storage or PROJ-port operation fails, THEN THE SYSTEM SHALL abort the import and persist no
  manuscrito.`
