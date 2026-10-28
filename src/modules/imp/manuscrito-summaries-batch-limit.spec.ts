import {
  ExecutionContext,
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { ImpController } from './imp.controller';
import { ImpService } from './imp.service';
import {
  CONFIRM_ESTRUTURA_USE_CASE,
  GET_MANUSCRITO_SUMMARIES_USE_CASE,
  IGNORE_SEGMENT_USE_CASE,
  IMPORT_MANUSCRIPT_USE_CASE,
} from './imp.tokens';
import { MANUSCRITO_REPOSITORY_PORT } from '../../domain/imp/ports/manuscrito-repository.port';

/**
 * HTTP-level validation tests for the batch size limit on
 * POST /api/v1/imp/manuscripts/summaries (§9 api-contract.md).
 *
 * Exactly 50 IDs → 200.
 * 51 IDs          → 400 (ValidationPipe enforces @ArrayMaxSize(50)).
 *
 * These tests spin up a minimal NestJS app with a stub guard so that
 * the real ValidationPipe runs on the HTTP layer — only supertest can
 * exercise @ArrayMaxSize because class-validator decorators are invoked
 * by the pipe, not by direct controller calls.
 */

const VALID_UUID = (n: number): string =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const makeUuids = (count: number): string[] =>
  Array.from({ length: count }, (_, i) => VALID_UUID(i + 1));

async function buildApp(): Promise<INestApplication> {
  const mockGuard = {
    canActivate: (ctx: ExecutionContext): boolean => {
      const req = ctx.switchToHttp().getRequest<Record<string, unknown>>();
      req['user'] = {
        userId: 'test-user',
        username: 'test',
        roles: ['editor'],
        scopes: ['imp:read'],
        empresaId: 'aetos',
      };
      return true;
    },
  };

  const summariesMock = jest.fn().mockResolvedValue([]);

  const module: TestingModule = await Test.createTestingModule({
    controllers: [ImpController],
    providers: [
      { provide: APP_GUARD, useValue: mockGuard },
      ImpService,
      {
        provide: IMPORT_MANUSCRIPT_USE_CASE,
        useValue: { execute: jest.fn() },
      },
      {
        provide: IGNORE_SEGMENT_USE_CASE,
        useValue: { ignore: jest.fn(), restore: jest.fn() },
      },
      {
        provide: CONFIRM_ESTRUTURA_USE_CASE,
        useValue: { execute: jest.fn() },
      },
      {
        provide: GET_MANUSCRITO_SUMMARIES_USE_CASE,
        useValue: { execute: summariesMock },
      },
      {
        provide: MANUSCRITO_REPOSITORY_PORT,
        useValue: {
          save: jest.fn(),
          findById: jest.fn().mockResolvedValue(null),
          findByProjetoId: jest.fn().mockResolvedValue([]),
          findSummariesByProjetoIds: jest.fn().mockResolvedValue([]),
        },
      },
    ],
  }).compile();

  const app = module.createNestApplication();
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  await app.init();
  return app;
}

describe('POST /api/v1/imp/manuscripts/summaries — batch size limit', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('accepts exactly 50 IDs and returns 200', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/imp/manuscripts/summaries')
      .set('Authorization', 'Bearer test-token')
      .send({ projetoIds: makeUuids(50) });

    expect(res.status).toBe(200);
  });

  it('rejects 51 IDs with 400 (ArrayMaxSize violation)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/imp/manuscripts/summaries')
      .set('Authorization', 'Bearer test-token')
      .send({ projetoIds: makeUuids(51) });

    expect(res.status).toBe(400);
  });
});
