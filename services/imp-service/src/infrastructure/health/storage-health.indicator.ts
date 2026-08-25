import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  HealthCheckError,
  HealthIndicator,
  HealthIndicatorResult,
} from '@nestjs/terminus';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

/**
 * Custom Terminus HealthIndicator for the local file-storage layer.
 *
 * On each `checkStorage()` call the indicator:
 *  1. Ensures the base directory exists (creating it recursively if needed).
 *  2. Writes a tiny probe file (`.health-probe`).
 *  3. Removes the probe immediately.
 *
 * A filesystem error in any step makes the indicator report `{ status: 'down' }`
 * and Terminus returns HTTP 503 to the caller.
 *
 * Base dir: env var `FILE_STORAGE_BASE_DIR` (default `/tmp/cordele-files`),
 * matching the value used by `LocalDiskAdapter`.
 */
@Injectable()
export class StorageHealthIndicator extends HealthIndicator {
  private readonly logger = new Logger(StorageHealthIndicator.name);
  private readonly baseDir: string;

  constructor(private readonly config: ConfigService) {
    super();
    this.baseDir = this.config.get<string>(
      'FILE_STORAGE_BASE_DIR',
      '/tmp/cordele-files',
    );
  }

  /**
   * Verifies that the file-storage directory is writable.
   *
   * @param key - The health-check key reported in the response body (e.g. `'storage'`).
   */
  async checkStorage(key: string): Promise<HealthIndicatorResult> {
    const probe = path.join(this.baseDir, '.health-probe');
    try {
      await fs.mkdir(this.baseDir, { recursive: true });
      await fs.writeFile(probe, 'ok');
      await fs.rm(probe, { force: true });
      return this.getStatus(key, true);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Storage health check failed for '${key}': ${errorMsg}`);
      throw new HealthCheckError(
        `${key} storage check failed`,
        this.getStatus(key, false, { error: errorMsg }),
      );
    }
  }
}
