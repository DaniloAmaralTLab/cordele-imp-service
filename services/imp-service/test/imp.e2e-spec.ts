import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import {
  JwtAuthGuard,
  type AuthenticatedUser,
} from '../src/infrastructure/auth/jwt-auth.guard';

const TEST_USER: AuthenticatedUser = {
  userId: '00000000-0000-0000-0000-000000000001',
  username: 'e2e-runner',
  roles: ['imp-user'],
  scopes: ['imp:read', 'imp:write'],
  tenantId: '00000000-0000-0000-0000-000000000002',
};

/**
 * End-to-end contract of the IMP (IMP) HTTP surface.
 *
 * The auth guard is replaced by a stub so the suite exercises routing,
 * validation and persistence — token verification has its own unit test.
 */
describe('Imp (e2e)', () => {
  let app: INestApplication;
  let createdId: string;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: { switchToHttp: () => { getRequest: () => Record<string, unknown> } }) => {
          context.switchToHttp().getRequest().user = TEST_USER;
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects a payload that violates the DTO contract', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/imp')
      .send({ name: 'x', unexpected: true })
      .expect(400);
  });

  it('creates a imp record', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/imp')
      .send({ name: 'e2e imp', description: 'created by the e2e suite' })
      .expect(201);

    expect(response.body).toMatchObject({ name: 'e2e imp', status: 'ACTIVE' });
    expect(response.body.id).toBeDefined();
    createdId = response.body.id;
  });

  it('reads the record back', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/imp/${createdId}`)
      .expect(200)
      .expect(({ body }) => expect(body.id).toBe(createdId));
  });

  it('lists records with pagination metadata', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/imp?page=1&size=10')
      .expect(200);

    expect(Array.isArray(response.body.items)).toBe(true);
    expect(typeof response.body.total).toBe('number');
  });

  it('patches the record', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/imp/${createdId}`)
      .send({ description: 'updated by the e2e suite' })
      .expect(200)
      .expect(({ body }) => expect(body.description).toBe('updated by the e2e suite'));
  });

  it('deletes the record and then returns 404', async () => {
    await request(app.getHttpServer())
      .delete(`/api/v1/imp/${createdId}`)
      .expect(204);

    await request(app.getHttpServer())
      .get(`/api/v1/imp/${createdId}`)
      .expect(404);
  });
});
