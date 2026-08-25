/**
 * Port do event bus de domínio (IMP-INT-003).
 *
 * Interface pura de domínio; sem decoradores Nest nem imports externos (RULE-01/02).
 * Implementada em infrastructure/events/.
 */

export interface DomainEvent {
  readonly eventName: string;
  readonly occurredAt: Date;
}

/**
 * Contract for publishing domain events.
 * Implemented by the infrastructure event bus (EventEmitter2 / in-memory).
 */
export interface IEventBus {
  publish(event: DomainEvent): Promise<void>;
}

/** Token de DI para IEventBus. */
export const EVENT_BUS_PORT = 'EVENT_BUS_PORT';
