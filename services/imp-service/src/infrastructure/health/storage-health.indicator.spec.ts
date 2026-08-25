import { HealthCheckError } from '@nestjs/terminus';
import * as fs from 'node:fs/promises';

import { StorageHealthIndicator } from './storage-health.indicator';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('node:fs/promises');
const fsMock = fs as jest.Mocked<typeof fs>;

function makeConfig(baseDir = '/tmp/cordele-test'): { get: jest.Mock } {
  return {
    get: jest.fn().mockReturnValue(baseDir),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('StorageHealthIndicator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('checkStorage — happy path', () => {
    it('should return status UP when the storage directory is writable', async () => {
      fsMock.mkdir.mockResolvedValue(undefined);
      fsMock.writeFile.mockResolvedValue(undefined);
      fsMock.rm.mockResolvedValue(undefined);

      const indicator = new StorageHealthIndicator(makeConfig() as never);
      const result = await indicator.checkStorage('storage');

      expect(result).toMatchObject({ storage: { status: 'up' } });
    });

    it('should probe mkdir, writeFile, and rm in order', async () => {
      const calls: string[] = [];
      fsMock.mkdir.mockImplementation(async () => { calls.push('mkdir'); return undefined; });
      fsMock.writeFile.mockImplementation(async () => { calls.push('writeFile'); return undefined; });
      fsMock.rm.mockImplementation(async () => { calls.push('rm'); return undefined; });

      const indicator = new StorageHealthIndicator(makeConfig() as never);
      await indicator.checkStorage('storage');

      expect(calls).toEqual(['mkdir', 'writeFile', 'rm']);
    });
  });

  describe('checkStorage — failure paths', () => {
    it('should throw HealthCheckError when mkdir fails', async () => {
      fsMock.mkdir.mockRejectedValue(new Error('permission denied'));

      const indicator = new StorageHealthIndicator(makeConfig() as never);

      await expect(indicator.checkStorage('storage')).rejects.toBeInstanceOf(
        HealthCheckError,
      );
    });

    it('should throw HealthCheckError when writeFile fails', async () => {
      fsMock.mkdir.mockResolvedValue(undefined);
      fsMock.writeFile.mockRejectedValue(new Error('disk full'));

      const indicator = new StorageHealthIndicator(makeConfig() as never);

      await expect(indicator.checkStorage('storage')).rejects.toBeInstanceOf(
        HealthCheckError,
      );
    });

    it('should include status DOWN on failure', async () => {
      fsMock.mkdir.mockResolvedValue(undefined);
      fsMock.writeFile.mockRejectedValue(new Error('disk full'));

      const indicator = new StorageHealthIndicator(makeConfig() as never);

      try {
        await indicator.checkStorage('storage');
        fail('expected HealthCheckError');
      } catch (err) {
        expect(err).toBeInstanceOf(HealthCheckError);
        const hce = err as HealthCheckError;
        expect(hce.causes).toMatchObject({ storage: { status: 'down' } });
      }
    });
  });

  describe('configuration', () => {
    it('should read FILE_STORAGE_BASE_DIR from ConfigService', () => {
      const config = makeConfig('/custom/path');
      new StorageHealthIndicator(config as never);
      expect(config.get).toHaveBeenCalledWith(
        'FILE_STORAGE_BASE_DIR',
        '/tmp/cordele-files',
      );
    });
  });
});
