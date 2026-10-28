import type { DomainEvent } from '../ports/event-bus.port';

/**
 * Evento emitido quando o parse de um manuscrito falha.
 * Tipo puro de domínio; sem decoradores Nest.
 */
export class ManuscriptImportRejectedEvent implements DomainEvent {
  readonly eventName = 'ManuscriptImportRejected';
  readonly occurredAt: Date;

  constructor(
    readonly filename: string,
    readonly empresaId: string,
    readonly reason: string,
  ) {
    this.occurredAt = new Date();
  }
}
