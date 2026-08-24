# Hub / TechLab AI Integration — imp-service (Importação)

**Status:** **Not applicable.** Cordelê has **no hub service** and **no TechLab AI dependency**
(`ai.hasAi = false`, doc 04 *Hub Service Dependencies*). Import runs fully local and deterministic.

## Why there is nothing to integrate

- **No shared "hub" service** in the Cordelê platform — it is a modular monolith (ADR-002), not a
  microservice mesh with an infrastructure hub (no Eureka, no gateway, no service registry;
  `serviceDiscovery.enabled = false`, `apiGateway.enabled = false`).
- **No TechLab AI** — the POC performs deterministic conversion only (doc 04 §Stack, doc 01 principle 4).
  There are no Feign clients, no `document_composition` / `orchestration` / `knowledge` / `analytics`
  calls, and no events consumed from TechLab AI.
- **No message broker** — `messaging.enabled = false`; cross-context signalling is in-process
  (`event-contracts.md`).

## Cross-context relationships (in-process, not a hub)

Import's only cross-context relationships are **in-process module calls / events** inside the monolith,
documented elsewhere:

- Outbound in-process call to the **PROJ** inbound port `CreateProjetoEditorialUseCase` and project
  validation → `integration-contracts.md`.
- Anchor event `ManuscriptImported` consumed in-process by PROJ → `event-contracts.md`.

## If this changes (post-POC)

Any future managed dependency (e.g. AI-assisted structure suggestions, a cloud malware-scan service)
enters as a **new infrastructure adapter behind a domain port** — no change to domain or application
layers (doc 04 §External Integrations). At that point this document would carry the Feign/HTTP contract,
propagation headers (`correlationId`, `empresa`, `principalId`) and fallback strategy.
