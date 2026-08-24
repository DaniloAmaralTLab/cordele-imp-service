# Event Catalog (ARTEMIS)

> Catálogo canônico de **todos** os eventos publicados no Cordelê.
>
> **Fonte de verdade:** `templates/architecture/decisions/events.arch.json` (D-065).
> Este markdown é gerado deterministicamente. Não editar à mão — o próximo render sobrescreve.

## Convenções

- **Nome do tópico:** `cordele.<module>.<entity>.<action>` (lowercase; tokens em snake/kebab quando preciso).
- **Versionamento no nome:** sufixo `.v<N>` em breaking change (mantém v1 ativa em paralelo durante deprecation).
- **Queue vs Topic:** single consumer → `queue`; múltiplos consumers → `topic` (queue = one consumer (e.g. audit-service only). topic = N independent subscribers each receive their own copy.).
- **Verbo da ação:** Use past participle (criado/confirmada/autorizada/recebido). Events describe a fait accompli, not a command.

## Envelope

### Headers JMS

- **`correlationId`** (uuid, required) — Request correlation id (from MDC); pairs the event with the producing request and downstream logs.
- **`empresaId`** (string, optional) — Tenant id (slug like 'emp_alpha'). May be null for global modules where is_global=true.
- **`producedAt`** (ISO-8601, required) — Time when the producer emitted the event (server clock, with timezone).

### Payload root fields

- **`eventId`** (uuid, required) — Idempotency key — consumers MUST be idempotent on this id.
- **`eventType`** (string, required) — Mirrors the destination name (e.g. 'bosq.cadastro.cliente.criado').
- **`eventVersion`** (string, required) — Semver-like, normally 'v1'.
- **`producedAt`** (ISO-8601, required) — Same as the header; duplicated in body for archival.
- **`producer`** ({service, instance, version}, required) — Identifies the emitting service instance and its version.
- **`empresaId`** (string, optional) — Same as header. Null for global events.
- **`correlationId`** (uuid, required) — Same as header.
- **`causationId`** (uuid, optional) — eventId that triggered this event (when applicable).
- **`actor`** ({usuarioId, papel}, optional) — Who caused the event. Optional for system-triggered events.
- **`data`** (object, required) — Event-specific payload — see per-event definition.

### Estrutura padrão do payload

```jsonc
{
  "eventId": <uuid>,
  "eventType": <string>,
  "eventVersion": <string>,
  "producedAt": <ISO-8601>,
  "producer": <{service, instance, version}>,
  "empresaId": <string> // opcional,
  "correlationId": <uuid>,
  "causationId": <uuid> // opcional,
  "actor": <{usuarioId, papel}> // opcional,
  "data": <object>
}
```

## Catálogo de eventos por módulo

> 0 módulos, **0 eventos** catalogados.

## Idempotência

Todo consumer mantém a tabela `processed_events`:

```sql
CREATE TABLE processed_events (
    event_id UUID PRIMARY KEY,
    event_type VARCHAR(100) NOT NULL,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

E checa antes de processar:

```java
if (processedEventRepo.existsById(event.eventId())) {
    log.info("Event {} already processed, skipping", event.eventId());
    return;
}
// ... processar ...
processedEventRepo.save(new ProcessedEvent(event.eventId(), event.eventType()));
```

Consumers persist eventId in processed_events before any side effect; retries with the same eventId are no-ops.

## Reentregas e DLQ

- Artemis configurado com **3 retentativas** com backoff: 1s, 5s, 30s.
- Após 3 falhas → vai para `cordele.dlq.<evento-original>`.
- DLQ é monitorada por alerta (#cordele-incident).
- Mensagens em DLQ podem ser reprocessadas via `POST /api/v1/admin/dlq/{queueName}/replay` (permissão `adm.dlq.replay`).

## Outbox pattern

When the event publication MUST happen if and only if the database commit succeeds, write to outbox_event in the same transaction and have a separate publisher poll-and-send. Avoids ghost events on rollback.

Tabela canônica: `outbox_event`. Requerido para: **events_in_transactional_path**.

## Como adicionar evento novo

1. Editar `templates/architecture/decisions/events.arch.json` — adicionar entrada em `modules[prefix=<modulo>].events`.
2. Validar: `python scripts/arch_decisions.py validate --aspect events`.
3. Bumpar `version` e `last_changed`.
4. Re-renderizar este documento.
5. Implementar producer no service emitente (`gen_event_producer` em be-module-generator gera o stub a partir do FQN).
6. Implementar consumer(s) nos services listados — não esquecer da checagem de idempotência.

## Anti-patterns

- ❌ Editar este markdown direto — ele é gerado. Próximo render sobrescreve.
- ❌ Publicar evento dentro de transação que pode dar rollback — use **outbox pattern** (gravar em `outbox_event` na mesma TX, publisher separado lê e envia).
- ❌ Consumer fazer chamada Feign síncrona durante processamento de evento — acopla e quebra o ganho do async.
- ❌ Esquecer `eventId` no payload — perde idempotência.
- ❌ Renomear evento sem deprecar (manter o nome antigo até consumers migrarem) — quebra auditoria histórica.
- ❌ Misturar Artemis com Kafka/RabbitMQ — Cordelê é **só Artemis**.

## Referências

- Padrões JMS (broker, queue config): [[../../backend/standards/platform-patterns]]
- Serviços + producers/consumers: [[../../backend/standards/services-catalog]]
- Outbox pattern: implementar via `cordele-migrations/V<N>__shared_outbox.sql`
- Multi-tenancy header contract: [[../multi-empresa]] §"Propagação assíncrona"
