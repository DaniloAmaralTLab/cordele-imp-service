import { Test, TestingModule } from '@nestjs/testing';
import { NotImplementedException, RequestMethod } from '@nestjs/common';

import { ImpController } from './imp.controller';
import { ImpService } from './imp.service';
import {
  CONFIRM_ESTRUTURA_USE_CASE,
  IGNORE_SEGMENT_USE_CASE,
  IMPORT_MANUSCRIPT_USE_CASE,
} from './imp.tokens';
import { MANUSCRITO_REPOSITORY_PORT } from '../../domain/imp/ports/manuscrito-repository.port';

/**
 * Testes de presença das 7 rotas de negócio no ImpController (P1).
 *
 * Verifica via Reflect.getMetadata que as rotas estão declaradas.
 * Não executa casos de uso reais (stubs em P1).
 */
describe('ImpController — P1 route presence', () => {
  let controller: ImpController;
  let module: TestingModule | undefined;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      controllers: [ImpController],
      providers: [
        ImpService,
        {
          provide: IMPORT_MANUSCRIPT_USE_CASE,
          useValue: {
            execute: jest
              .fn()
              .mockRejectedValue(new NotImplementedException()),
          },
        },
        {
          provide: IGNORE_SEGMENT_USE_CASE,
          useValue: {
            ignore: jest.fn(),
            restore: jest.fn(),
          },
        },
        {
          provide: CONFIRM_ESTRUTURA_USE_CASE,
          useValue: {
            execute: jest
              .fn()
              .mockRejectedValue(new NotImplementedException()),
          },
        },
        {
          provide: MANUSCRITO_REPOSITORY_PORT,
          useValue: {
            save: jest.fn(),
            findById: jest.fn().mockResolvedValue(null),
            findByProjetoId: jest.fn().mockResolvedValue([]),
          },
        },
      ],
    }).compile();

    controller = module.get<ImpController>(ImpController);
  });

  afterEach(async () => {
    if (module) {
      await module.close();
    }
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('route declarations via Reflect', () => {
    /**
     * NestJS armazena o método HTTP como um número (RequestMethod enum) na
     * chave 'method' e o path relativo na chave 'path'.
     */
    const REQUEST_METHOD_NAME: Record<number, string> = {
      [RequestMethod.GET]: 'GET',
      [RequestMethod.POST]: 'POST',
      [RequestMethod.PUT]: 'PUT',
      [RequestMethod.DELETE]: 'DELETE',
      [RequestMethod.PATCH]: 'PATCH',
      [RequestMethod.ALL]: 'ALL',
      [RequestMethod.OPTIONS]: 'OPTIONS',
      [RequestMethod.HEAD]: 'HEAD',
    };

    const getRoutes = (ctrl: object): Array<{ method: string; path: string }> => {
      const proto = Object.getPrototypeOf(ctrl) as Record<string, unknown>;
      const methods = Object.getOwnPropertyNames(proto).filter(
        (k) => k !== 'constructor',
      );

      return methods.flatMap((methodName) => {
        const handler = proto[methodName] as object;
        const httpMethodNum: number | undefined = Reflect.getMetadata(
          'method',
          handler,
        );
        const path: string | undefined = Reflect.getMetadata('path', handler);

        if (httpMethodNum !== undefined && path !== undefined) {
          const methodStr = REQUEST_METHOD_NAME[httpMethodNum] ?? String(httpMethodNum);
          return [{ method: methodStr, path }];
        }
        return [];
      });
    };

    it('should have POST manuscripts route', () => {
      const routes = getRoutes(controller);
      const found = routes.some(
        (r) => r.method === 'POST' && r.path === 'manuscripts',
      );
      expect(found).toBe(true);
    });

    it('should have GET manuscripts/:id route', () => {
      const routes = getRoutes(controller);
      const found = routes.some(
        (r) => r.method === 'GET' && r.path === 'manuscripts/:id',
      );
      expect(found).toBe(true);
    });

    it('should have GET manuscripts/:id/estrutura route', () => {
      const routes = getRoutes(controller);
      const found = routes.some(
        (r) => r.method === 'GET' && r.path === 'manuscripts/:id/estrutura',
      );
      expect(found).toBe(true);
    });

    it('should have GET projetos/:projetoId/manuscritos route', () => {
      const routes = getRoutes(controller);
      const found = routes.some(
        (r) =>
          r.method === 'GET' &&
          r.path === 'projetos/:projetoId/manuscritos',
      );
      expect(found).toBe(true);
    });

    it('should have POST manuscripts/:id/segmentos/:segId/ignore route', () => {
      const routes = getRoutes(controller);
      const found = routes.some(
        (r) =>
          r.method === 'POST' &&
          r.path === 'manuscripts/:id/segmentos/:segId/ignore',
      );
      expect(found).toBe(true);
    });

    it('should have DELETE manuscripts/:id/segmentos/:segId/ignore route', () => {
      const routes = getRoutes(controller);
      const found = routes.some(
        (r) =>
          r.method === 'DELETE' &&
          r.path === 'manuscripts/:id/segmentos/:segId/ignore',
      );
      expect(found).toBe(true);
    });

    it('should have POST manuscripts/:id/confirm-estrutura route', () => {
      const routes = getRoutes(controller);
      const found = routes.some(
        (r) =>
          r.method === 'POST' &&
          r.path === 'manuscripts/:id/confirm-estrutura',
      );
      expect(found).toBe(true);
    });
  });

  describe('service stub methods throw NotImplementedException in P1', () => {
    let service: ImpService;

    beforeEach(() => {
      service = module!.get<ImpService>(ImpService);
    });

    it('importManuscrito throws NotImplementedException', async () => {
      const fakeFile = {
        originalname: 'f.docx',
        mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        buffer: Buffer.alloc(0),
        size: 0,
      } as Express.Multer.File;
      await expect(
        service.importManuscrito(
          { projetoId: 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380b22' },
          { userId: 'u1', username: 'u', roles: [], scopes: [], empresaId: 'aetos' },
          fakeFile,
        ),
      ).rejects.toBeInstanceOf(NotImplementedException);
    });

    it('confirmEstrutura throws NotImplementedException', async () => {
      await expect(
        service.confirmEstrutura('id-1', {
          userId: 'u1',
          username: 'u',
          roles: [],
          scopes: [],
          empresaId: 'aetos',
        }),
      ).rejects.toBeInstanceOf(NotImplementedException);
    });
  });
});
