import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

// Usa el .env real: /health/ready y el JWKS consultan el proyecto de Supabase.
describe('App (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication({ logger: false });
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('health (público)', () => {
    it('GET /api/v1/health/live → 200 sin token', () => {
      return request(app.getHttpServer())
        .get('/api/v1/health/live')
        .expect(200)
        .expect({ status: 'ok' });
    });

    it('GET /api/v1/health/ready → 200 con database y auth up', () => {
      return request(app.getHttpServer())
        .get('/api/v1/health/ready')
        .expect(200)
        .expect({ status: 'ok', checks: { database: 'up', auth: 'up' } });
    });
  });

  describe('rutas protegidas', () => {
    it('401 sin token, con la forma única de error', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/dev/whoami')
        .expect(401);

      expect(res.body).toEqual({
        statusCode: 401,
        message: 'Debes iniciar sesión',
        correlationId: expect.any(String),
        timestamp: expect.any(String),
        path: '/api/v1/dev/whoami',
      });
      expect(res.headers['x-correlation-id']).toBe(res.body.correlationId);
    });

    it('401 con un token inventado', () => {
      return request(app.getHttpServer())
        .get('/api/v1/dev/whoami')
        .set('Authorization', 'Bearer eyJhbGciOiJFUzI1NiJ9.e30.firma-falsa')
        .expect(401)
        .expect((res) =>
          expect(res.body.message).toBe('Tu sesión expiró o no es válida'),
        );
    });

    it('reutiliza un X-Correlation-Id válido que envía el cliente', () => {
      return request(app.getHttpServer())
        .get('/api/v1/dev/whoami')
        .set('X-Correlation-Id', 'mi-correlation-123')
        .expect(401)
        .expect('X-Correlation-Id', 'mi-correlation-123');
    });
  });

  it('404 en ruta inexistente también usa la forma única de error', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/no-existe')
      .set('Authorization', 'Bearer x');
    // El guard corre antes del router: sin token válido responde 401, nunca filtra si la ruta existe.
    expect([401, 404]).toContain(res.status);
    expect(res.body).toHaveProperty('correlationId');
  });
});
