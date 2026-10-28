import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { LocalDiskAdapter } from './local-disk.adapter';

describe('LocalDiskAdapter', () => {
  let adapter: LocalDiskAdapter;
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'local-disk-spec-'));
  });

  afterAll(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        LocalDiskAdapter,
        {
          provide: ConfigService,
          useValue: {
            get: (_key: string, def: string) =>
              _key === 'FILE_STORAGE_BASE_DIR' ? tempDir : def,
          },
        },
      ],
    }).compile();

    adapter = moduleRef.get(LocalDiskAdapter);
  });

  describe('store', () => {
    it('armazena arquivo e retorna storage key escopada por empresa', async () => {
      const buffer = Buffer.from('conteúdo do manuscrito');
      const storageKey = await adapter.store(
        buffer,
        'livro.md',
        'text/markdown',
        'aetos',
        'ms-001',
      );

      expect(storageKey).toBe('emp_aetos/ms-001/livro.md');

      const fullPath = path.join(tempDir, storageKey);
      const stored = await fs.readFile(fullPath);
      expect(stored.equals(buffer)).toBe(true);
    });

    it('isola arquivos de empresas diferentes', async () => {
      const buf1 = Buffer.from('empresa A');
      const buf2 = Buffer.from('empresa B');

      const key1 = await adapter.store(buf1, 'doc.md', 'text/markdown', 'empresa-a', 'ms-001');
      const key2 = await adapter.store(buf2, 'doc.md', 'text/markdown', 'empresa-b', 'ms-001');

      expect(key1).not.toBe(key2);
      expect(key1).toContain('emp_empresa-a');
      expect(key2).toContain('emp_empresa-b');
    });
  });

  describe('retrieve', () => {
    it('recupera o conteúdo armazenado', async () => {
      const buffer = Buffer.from('conteúdo a recuperar');
      const key = await adapter.store(buffer, 'test.md', 'text/markdown', 'aetos', 'ms-002');
      const retrieved = await adapter.retrieve(key);
      expect(retrieved.equals(buffer)).toBe(true);
    });
  });

  describe('delete', () => {
    it('remove o arquivo e não lança erro se chamar delete novamente', async () => {
      const buffer = Buffer.from('a deletar');
      const key = await adapter.store(buffer, 'del.md', 'text/markdown', 'aetos', 'ms-003');

      await adapter.delete(key);

      // Arquivo não deve existir.
      await expect(fs.access(path.join(tempDir, key))).rejects.toThrow();

      // Segundo delete não deve lançar erro (force: true).
      await expect(adapter.delete(key)).resolves.toBeUndefined();
    });
  });
});
