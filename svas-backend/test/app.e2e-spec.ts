import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import Decimal from 'decimal.js';
import { AppModule } from './../src/app.module';
import { CalculadoraPrimasService } from './../src/modules/cotizacion/application/calculadora-primas.service';

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

    it.each([
      ['get', '/api/v1/admin/panel'],
      ['get', '/api/v1/admin/aseguradoras'],
      ['get', '/api/v1/admin/tarifas/completitud'],
      ['put', '/api/v1/admin/tarifas/pesos/marca'],
      ['put', '/api/v1/admin/parametros'],
      ['delete', '/api/v1/admin/campos/6f1c2b1e-8a3d-4c2e-9b7a-1d2e3f4a5b6c'],
    ] as const)('%s %s sin token → 401', (metodo, ruta) =>
      http()[metodo](ruta).expect(401),
    );

    it('reutiliza un X-Correlation-Id válido que envía el cliente', () =>
      http()
        .get('/api/v1/usuarios/me')
        .set('X-Correlation-Id', 'mi-correlation-123')
        .expect(401)
        .expect('X-Correlation-Id', 'mi-correlation-123'));
  });

  describe('catálogo público y primas (datos reales del seed)', () => {
    const buscar = <T extends { nombre: string }>(xs: T[], nombre: string) =>
      xs.find((x) => x.nombre === nombre)!;

    it('GET /catalogo/campos: unión sin "tipo" y con las 5 aseguradoras', async () => {
      const res = await http().get('/api/v1/catalogo/campos').expect(200);
      expect(res.body.aseguradoras).toHaveLength(5);
      const nombres = (res.body.campos as { nombre: string }[]).map(
        (c) => c.nombre,
      );
      expect(nombres.slice(0, 4)).toEqual([
        'marca',
        'modelo',
        'anio',
        'ubigeo',
      ]);
      expect(nombres).not.toContain('tipo');
    });

    it('marcas → modelos → años → distritos (sin token)', async () => {
      const marcas = (
        await http().get('/api/v1/catalogo/vehiculos/marcas').expect(200)
      ).body;
      expect(marcas).toHaveLength(21);
      const toyota = buscar(marcas, 'Toyota');
      const modelos = (
        await http()
          .get(`/api/v1/catalogo/vehiculos/marcas/${toyota.id}/modelos`)
          .expect(200)
      ).body;
      expect(buscar(modelos, 'Corolla').tipo).toBe('Sedán');
      const anios = (
        await http()
          .get(
            `/api/v1/catalogo/vehiculos/modelos/${buscar(modelos, 'Corolla').id}/anios`,
          )
          .expect(200)
      ).body;
      expect(anios[0]).toBe(2026);
      expect(anios).toContain(2022);
      const distritos = (
        await http()
          .get('/api/v1/catalogo/ubigeos/distritos')
          .query({ departamento: 'Lima', provincia: 'Lima' })
          .expect(200)
      ).body;
      expect(distritos).toContainEqual({
        ubigeo: '150122',
        distrito: 'Miraflores',
      });
    });

    it('caso dorado §17.6: las 10 primas del Corolla 2022 en Miraflores con S = 15 000', async () => {
      const marcas = (await http().get('/api/v1/catalogo/vehiculos/marcas'))
        .body;
      const modelos = (
        await http().get(
          `/api/v1/catalogo/vehiculos/marcas/${buscar(marcas, 'Toyota').id}/modelos`,
        )
      ).body;
      const corolla = buscar(modelos, 'Corolla');
      const v = await app
        .get(CalculadoraPrimasService)
        ['catalogo'].resolverVehiculo(corolla.id, 2022, '150122');
      const r = await app
        .get(CalculadoraPrimasService)
        .calcular(v!, { suma: new Decimal(15000) });
      const tabla = Object.fromEntries(
        r.flatMap((a) =>
          a.planes.map((p) => [
            `${a.codigoEstrategia} ${p.plan}`,
            `${p.prima?.toFixed(2)} / ${p.primaMensual?.toFixed(2)}`,
          ]),
        ),
      );
      expect(tabla).toEqual({
        'RIMAC Plata': '457.43 / 38.12',
        'RIMAC Oro': '640.40 / 53.37',
        'PACIFICO Básico': '429.25 / 35.77',
        'PACIFICO Premium': '615.36 / 51.28',
        'LA_POSITIVA Clásico': '454.74 / 39.79',
        'LA_POSITIVA Full': '651.79 / 57.03',
        'MAPFRE Esencial': '431.80 / 35.98',
        'MAPFRE Total': '610.47 / 50.87',
        'QUALITAS Estándar': '447.64 / 37.30',
        'QUALITAS Plus': '635.36 / 52.95',
      });
    });

    it('POST /admin/tarifas/simular sin token → 401', () =>
      http().post('/api/v1/admin/tarifas/simular').expect(401));
  });
});
