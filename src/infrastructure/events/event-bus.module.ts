import { Global, Module } from '@nestjs/common';

import { EVENT_BUS_PORT } from '../../domain/imp/ports/event-bus.port';
import { InMemoryEventBus } from './in-memory-event-bus';

/**
 * Módulo de event bus (IMP-INT-003).
 *
 * Decorado com @Global() para que qualquer módulo possa injetar EVENT_BUS_PORT
 * sem importar este módulo diretamente.
 * NÃO importa modules/ (RULE-05).
 */
@Global()
@Module({
  providers: [
    InMemoryEventBus,
    { provide: EVENT_BUS_PORT, useClass: InMemoryEventBus },
  ],
  exports: [EVENT_BUS_PORT],
})
export class EventBusModule {}
