import { Injectable, Logger } from '@nestjs/common';

import type {
  DomainEvent,
  IEventBus,
} from '../../domain/imp/ports/event-bus.port';

/**
 * Implementação in-memory do IEventBus (IMP-INT-003).
 *
 * Logs os eventos publicados; adequado para desenvolvimento e testes.
 * Substituível por adapter EventEmitter2 / mensageria real em produção.
 * NÃO importa modules/ (RULE-05).
 */
@Injectable()
export class InMemoryEventBus implements IEventBus {
  private readonly logger = new Logger(InMemoryEventBus.name);

  async publish(event: DomainEvent): Promise<void> {
    this.logger.log(
      `[EventBus] ${event.eventName} published at ${event.occurredAt.toISOString()}`,
    );
  }
}
