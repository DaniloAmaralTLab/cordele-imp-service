# SPEC-07 — Observability & Health

**Module:** IMP · **Refs:** doc 02 §Cross-cutting (Observability), `contracts/api-contract.md` §3.

## Objetivo

Especificar logs estruturados, eventos de pipeline, métricas de parse e health checks, correlacionados
por `trace_id`/`X-Correlation-Id`.

## Escopo

- **In:** correlação; diagnósticos de parse como first-class; health/readiness.
- **Out:** dashboards; alerting (operação).

## Decisões técnicas

- `X-Correlation-Id` propagado (gerado se ausente) para logs e eventos; refletido na resposta.
- Diagnósticos de parse (counts, `trechosNaoParseados`, duração, formato, tamanho) logados por upload.
- Health via endpoint padrão do NestJS (`/health` no monólito) — DB e storage como dependências.

## Implementação

- Interceptor de correlação no `ImpController`. Logger estruturado (JSON) com `empresa`, `correlationId`,
  `manuscritoId`.
- Emitir evento de pipeline por upload/parse (start/end) com `trace_id` (padrão D-423 da plataforma).
- Readiness falha se DB/storage indisponíveis.

## Casos de borda

- Parse longo (arquivo grande) → registrar duração; sem timeout artificial além do limite de request.
- Falha de storage/DB → readiness `DOWN`; upload retorna 5xx com ProblemDetail e `traceId`.

## Critérios de aceite (EARS)

- `THE SYSTEM SHALL attach a correlationId to every request, generating one when absent, and return it in
  the response.`
- `WHEN a manuscript is imported, THE SYSTEM SHALL log parse diagnostics (formato, tamanho, counts,
  trechosNaoParseados, duração) correlated by trace_id.`
- `WHILE the database or file storage is unavailable, THE SYSTEM SHALL report readiness as DOWN.`
- `IF an unexpected error occurs, THEN THE SYSTEM SHALL return a ProblemDetail carrying the traceId.`
