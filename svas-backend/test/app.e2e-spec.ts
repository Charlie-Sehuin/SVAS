import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

// Usa el .env real: /health/ready, el JWKS y /auth/login consultan el proyecto
// de Supabase. Ningún caso crea datos (los de registro fallan en validación).
describe('App (e2e)', () => {
  let app: INestApplication<App>;
  const http = () => request(app.getHttpServer());

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
    it('GET /health/live → 200 sin token', () =>
      http().get('/api/v1/health/live').expect(200).expect({ status: 'ok' }));

    it('GET /health/ready → 200 con database y auth up', () =>
      http()
        .get('/api/v1/health/ready')
        .expect(200)
        .expect({ status: 'ok', checks: { database: 'up', auth: 'up' } }));
  });

  describe('auth (público)', () => {
    it('POST /auth/registro sin datos → 400 con errores por campo', async () => {
      const res = await http()
        .post('/api/v1/auth/registro')
        .send({})
        .expect(400);
      expect(res.body.errors.map((e: { campo: string }) => e.campo)).toEqual(
        expect.arrayContaining([
          'nombres',
          'apellidos',
          'email',
          'password',
          'telefono',
        ]),
      );
    });

    it('login y refresh no existen en el backend (los hace supabase-js)', async () => {
      await http().post('/api/v1/auth/login').send({}).expect(404);
      await http().post('/api/v1/auth/refresh').send({}).expect(404);
    });

    it('POST /auth/registro rechaza auto-asignarse un rol (no crea nada)', async () => {
      const res = await http()
        .post('/api/v1/auth/registro')
        .send({
          nombres: 'Test',
          apellidos: 'E2E',
          email: 'e2e@seguro-simple.test',
          password: 'secreta123',
          telefono: '987654321',
          rol: 'ADMINISTRADOR',
        })
        .expect(400);
      expect(JSON.stringify(res.body.errors)).toContain('rol');
    });
  });

  describe('rutas protegidas', () => {
    it('GET /usuarios/me sin token → 401 con la forma única de error', async () => {
      const res = await http().get('/api/v1/usuarios/me').expect(401);
      expect(res.body).toEqual({
        statusCode: 401,
        message: 'Debes iniciar sesión',
        correlationId: expect.any(String),
        timestamp: expect.any(String),
        path: '/api/v1/usuarios/me',
      });
      expect(res.headers['x-correlation-id']).toBe(res.body.correlationId);
    });

    it('GET /admin/usuarios con un token inventado → 401', async () => {
      const res = await http()
        .get('/api/v1/admin/usuarios')
        .set('Authorization', 'Bearer eyJhbGciOiJFUzI1NiJ9.e30.firma-falsa')
        .expect(401);
      expect(res.body.message).toBe('Tu sesión expiró o no es válida');
    });

    it('reutiliza un X-Correlation-Id válido que envía el cliente', () =>
      http()
        .get('/api/v1/usuarios/me')
        .set('X-Correlation-Id', 'mi-correlation-123')
        .expect(401)
        .expect('X-Correlation-Id', 'mi-correlation-123'));
  });
});
