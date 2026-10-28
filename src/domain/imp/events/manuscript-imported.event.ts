import type { DomainEvent } from '../ports/event-bus.port';

/**
 * Evento emitido após importação bem-sucedida de um manuscrito.
 * Tipo puro de domínio; sem decoradores Nest.
 */
export class ManuscriptImportedEvent implements DomainEvent {
  readonly eventName = 'ManuscriptImported';
  readonly occurredAt: Date;

  constructor(
    readonly manuscritoId: string,
    readonly projetoId: string,
    readonly empresaId: string,
    readonly filename: string,
  ) {
    this.occurredAt = new Date();
  }
}
