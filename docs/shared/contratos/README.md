# Contratos cross BE-FE

Documentação canônica dos **contratos** que atravessam BE e FE: eventos JMS, error model HTTP, OpenAPI gerado de cada serviço.

## Documentos desta pasta

| Doc | Quando ler |
|---|---|
| [`event-catalog.md`](event-catalog.md) | Antes de criar evento JMS novo, ou consumir um existente. Lista completa de tópicos `cordele.*`, producers, consumers e schema do payload |
| [`error-model.md`](error-model.md) | Antes de criar `@RestControllerAdvice` (BE) ou interceptor de erro (FE). Define `ProblemDetail` RFC 7807 canônico + códigos `error.code` do projeto |
| [`openapi/README.md`](openapi/README.md) | Quando rodar `springdoc-openapi` para gerar/atualizar specs `<service>-openapi.yaml`. SDKs TS são gerados de lá para `@cordele/shared/contracts/` |

## Princípio

- **Contratos-first.** Antes de criar handler/listener/component novo, o contrato é registrado aqui (ou no `<service>-spec/contracts/`).
- **Evento JMS é um contrato como qualquer outro** — versionar, depreciar, evoluir com cuidado.
- **OpenAPI é gerado** (não escrito à mão) a partir dos controllers + records DTO de cada serviço.
- **Error model é único.** Não existe "erro do CAD" diferente de "erro do FIS" — ambos seguem o mesmo `ProblemDetail`.

## Catálogos consolidados em outros docs

| O que | Onde |
|---|---|
| Lista de microserviços + Feign Clients | [[../../backend/standards/services-catalog]] §1 e §7 |
| Event catalog inicial (parcial) | [[../../backend/standards/services-catalog]] §6 — **expandido** em [`event-catalog.md`](event-catalog.md) |
| Padrões JMS (queues, headers, idempotência) | [[../../backend/standards/platform-patterns]] |
| Convenções REST (versioning, paginação) | [[../../backend/standards/java-conventions]] |
| Frontend HTTP interceptors | [[../../frontend/standards/access-layer-contracts]] |

## Como evolui um contrato

1. **Mudança backward-compatible** (campo novo opcional): atualizar OpenAPI/event-catalog, regenerar SDK, FE pode adotar quando quiser.
2. **Mudança breaking** (campo removido/renomeado/tipo mudado): criar **v2 do contrato** lado a lado, deprecar v1 por N versões, comunicar consumers via Slack #cordele-arquitetura.
3. **Evento JMS breaking**: criar tópico novo (`cordele.modulo.evento.v2`), manter v1 vivo até <service> e todos consumers migrarem.

## Anti-patterns

- ❌ Quebrar contrato sem evento de deprecação publicado.
- ❌ Mudar shape de payload JMS sem bump de versão.
- ❌ Escrever OpenAPI à mão (sempre gerar a partir do código).
- ❌ Criar tipo de erro novo sem registrar em `error-model.md`.
