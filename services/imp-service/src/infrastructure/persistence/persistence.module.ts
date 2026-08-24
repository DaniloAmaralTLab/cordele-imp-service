import { Module } from '@nestjs/common';

import { DatabaseModule } from './database.module';

/**
 * Re-exports the persistence providers that feature modules may inject.
 *
 * Kept separate from DatabaseModule so the global connection concern and the
 * per-context dependency declaration do not collapse into one module.
 */
@Module({
  imports: [DatabaseModule],
  exports: [DatabaseModule],
})
export class PersistenceModule {}
