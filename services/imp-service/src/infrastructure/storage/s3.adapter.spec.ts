import {
  DeleteObjectCommand,
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'node:stream';

import { S3Adapter } from './s3.adapter';

// ---------------------------------------------------------------------------
// Mock do @aws-sdk/client-s3 — sem rede, sem credenciais reais.
// ---------------------------------------------------------------------------
jest.mock('@aws-sdk/client-s3', () => {
  const original = jest.requireActual('@aws-sdk/client-s3') as object;
  return {
    ...original,
    S3Client: jest.fn().mockImplementation(() => ({
      send: jest.fn(),
    })),
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(overrides: Record<string, string> = {}): ConfigService {
  return {
    get: jest.fn((key: string, defaultVal?: string) => {
      const map: Record<string, string> = {
        S3_BUCKET: 'test-bucket',
        S3_REGION: 'us-east-1',
        S3_ACCESS_KEY: 'fake-access-key',
        S3_SECRET_KEY: 'fake-secret-key',
        ...overrides,
      };
      return map[key] ?? defaultVal;
    }),
  } as unknown as ConfigService;
}

/** Cria um Readable stream de Node a partir de um Buffer para simular a resposta do S3 GetObject. */
function bufferToReadable(buf: Buffer): NodeJS.ReadableStream {
  const r = new Readable();
  r.push(buf);
  r.push(null);
  return r;
}

// ---------------------------------------------------------------------------
// Suite principal
// ---------------------------------------------------------------------------

describe('S3Adapter', () => {
  let adapter: S3Adapter;
  let mockSend: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    const config = makeConfig();
    adapter = new S3Adapter(config);

    // Extrair o mock de send criado pelo S3Client mockado
    const MockedS3Client = S3Client as jest.MockedClass<typeof S3Client>;
    mockSend = MockedS3Client.mock.results[0].value.send as jest.Mock;
  });

  // -------------------------------------------------------------------------
  // store()
  // -------------------------------------------------------------------------

  describe('store()', () => {
    it('deve enviar PutObjectCommand com a chave correta', async () => {
      mockSend.mockResolvedValueOnce({});

      const buffer = Buffer.from('conteudo-teste');
      const key = await adapter.store(
        buffer,
        'manuscrito.docx',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'aetos',
        'manu-001',
      );

      expect(key).toBe('emp_aetos/manu-001/manuscrito.docx');

      const [cmd] = mockSend.mock.calls[0] as [PutObjectCommand];
      expect(cmd).toBeInstanceOf(PutObjectCommand);

      const input = cmd.input;
      expect(input.Bucket).toBe('test-bucket');
      expect(input.Key).toBe('emp_aetos/manu-001/manuscrito.docx');
      expect(input.Body).toBe(buffer);
      expect(input.ContentType).toBe(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      );
      expect(input.ContentLength).toBe(buffer.length);
    });

    it('deve propagar erro do S3 em caso de falha no upload', async () => {
      mockSend.mockRejectedValueOnce(new Error('S3 network error'));

      await expect(
        adapter.store(Buffer.from('x'), 'f.md', 'text/markdown', 'aetos', 'manu-002'),
      ).rejects.toThrow('S3 network error');
    });
  });

  // -------------------------------------------------------------------------
  // retrieve()
  // -------------------------------------------------------------------------

  describe('retrieve()', () => {
    it('deve retornar o conteúdo do arquivo como Buffer', async () => {
      const expected = Buffer.from('conteudo do arquivo');
      mockSend.mockResolvedValueOnce({
        Body: bufferToReadable(expected),
      });

      const result = await adapter.retrieve('emp_aetos/manu-001/manuscrito.docx');

      expect(result).toBeInstanceOf(Buffer);
      expect(result).toEqual(expected);

      const [cmd] = mockSend.mock.calls[0] as [GetObjectCommand];
      expect(cmd).toBeInstanceOf(GetObjectCommand);
      expect(cmd.input.Bucket).toBe('test-bucket');
      expect(cmd.input.Key).toBe('emp_aetos/manu-001/manuscrito.docx');
    });

    it('deve propagar erro do S3 quando chave não existe', async () => {
      mockSend.mockRejectedValueOnce(new NoSuchKey({ message: 'key not found', $metadata: {} }));

      await expect(adapter.retrieve('emp_aetos/manu-001/inexistente.docx')).rejects.toBeInstanceOf(
        NoSuchKey,
      );
    });
  });

  // -------------------------------------------------------------------------
  // delete()
  // -------------------------------------------------------------------------

  describe('delete()', () => {
    it('deve enviar DeleteObjectCommand com a chave correta', async () => {
      mockSend.mockResolvedValueOnce({});

      await adapter.delete('emp_aetos/manu-001/manuscrito.docx');

      const [cmd] = mockSend.mock.calls[0] as [DeleteObjectCommand];
      expect(cmd).toBeInstanceOf(DeleteObjectCommand);
      expect(cmd.input.Bucket).toBe('test-bucket');
      expect(cmd.input.Key).toBe('emp_aetos/manu-001/manuscrito.docx');
    });

    it('deve ignorar silenciosamente NoSuchKey (delete idempotente)', async () => {
      mockSend.mockRejectedValueOnce(
        new NoSuchKey({ message: 'The specified key does not exist.', $metadata: {} }),
      );

      // Não deve lançar exceção
      await expect(adapter.delete('emp_aetos/manu-001/inexistente.docx')).resolves.toBeUndefined();
    });

    it('deve propagar outros erros do S3', async () => {
      mockSend.mockRejectedValueOnce(new Error('AccessDenied'));

      await expect(adapter.delete('emp_aetos/manu-001/arquivo.docx')).rejects.toThrow(
        'AccessDenied',
      );
    });
  });

  // -------------------------------------------------------------------------
  // Inicialização — leitura de env vars
  // -------------------------------------------------------------------------

  describe('inicialização', () => {
    it('deve ler S3_BUCKET, S3_REGION, S3_ACCESS_KEY e S3_SECRET_KEY do ConfigService', () => {
      const config = makeConfig({
        S3_BUCKET: 'meu-bucket',
        S3_REGION: 'sa-east-1',
        S3_ACCESS_KEY: 'AKIAIOSFODNN7EXAMPLE',
        S3_SECRET_KEY: 'wJalrXUtnFEMI',
      });
      new S3Adapter(config);

      expect(config.get).toHaveBeenCalledWith('S3_REGION', 'us-east-1');
      expect(config.get).toHaveBeenCalledWith('S3_ACCESS_KEY', '');
      expect(config.get).toHaveBeenCalledWith('S3_SECRET_KEY', '');
      expect(config.get).toHaveBeenCalledWith('S3_BUCKET', '');
    });
  });
});
