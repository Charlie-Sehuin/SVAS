import { BadRequestException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CatalogoAdminService } from './application/catalogo-admin.service';
import {
  normalizarValores,
  validarCampo,
  validarDescuentos,
  type Plan,
} from './domain/catalogo';
import type { CatalogoAdminRepository } from './domain/catalogo-admin.repository.port';
import {
  ActualizarParametrosDto,
  CrearCampoDto,
  GuardarReglasDto,
} from './presentation/dto/catalogo-admin.dto';

describe('dominio del catálogo', () => {
  describe('validarCampo (RN-17)', () => {
    it('acepta marca como LISTA de CATALOGO sin valores', () => {
      expect(
        validarCampo({
          nombre: 'marca',
          tipo: 'LISTA',
          origenValores: 'CATALOGO',
          valores: [],
        }),
      ).toEqual([]);
    });

    it('rechaza CATALOGO para un campo que no es de catálogo', () => {
      expect(
        validarCampo({
          nombre: 'color',
          tipo: 'LISTA',
          origenValores: 'CATALOGO',
          valores: [],
        }),
      ).toHaveLength(1);
    });

    it('exige valores en una LISTA ESTATICO', () => {
      expect(
        validarCampo({
          nombre: 'clase',
          tipo: 'LISTA',
          origenValores: 'ESTATICO',
          valores: [],
        }),
      ).toEqual([
        'Un campo de tipo lista necesita al menos un valor permitido',
      ]);
    });

    it('rechaza valores en un campo TEXTO', () => {
      expect(
        validarCampo({
          nombre: 'placa',
          tipo: 'TEXTO',
          origenValores: 'ESTATICO',
          valores: ['x'],
        }),
      ).toEqual(['Solo los campos de tipo lista llevan valores permitidos']);
    });
  });

  it('normalizarValores recorta, quita vacíos y duplicados', () => {
    expect(normalizarValores([' Rojo', 'Azul', 'Rojo ', '  '])).toEqual([
      'Rojo',
      'Azul',
    ]);
  });

  describe('validarDescuentos (0 < primera ≤ máximo ≤ 100)', () => {
    it('acepta 5 y 10', () => {
      expect(
        validarDescuentos({
          descuentoPrimeraCompra: '5.00',
          descuentoMaximo: '10.00',
        }),
      ).toEqual([]);
    });
    it('rechaza primera compra mayor que el máximo', () => {
      expect(
        validarDescuentos({
          descuentoPrimeraCompra: 12,
          descuentoMaximo: '10.00',
        }),
      ).toEqual([
        'El descuento de primera compra no puede superar el descuento máximo',
      ]);
    });
  });
});

describe('CatalogoAdminService', () => {
  const plan: Plan = {
    id: 'p1',
    aseguradoraId: 'a1',
    nombre: 'Plata',
    descripcion: 'Texto',
    activo: true,
  };

  function crear(parcial: Partial<CatalogoAdminRepository> = {}) {
    const repo = {
      buscarPlan: jest.fn().mockResolvedValue(plan),
      editarPlan: jest.fn().mockResolvedValue({ ...plan, nombre: 'Plata+' }),
      cambiarEstadoPlan: jest
        .fn()
        .mockResolvedValue({ ...plan, activo: false }),
      crearCampo: jest
        .fn()
        .mockImplementation((_t, _a, c) => Promise.resolve(c)),
      cambiarEstadoCampo: jest.fn().mockResolvedValue({}),
      guardarReglas: jest.fn().mockResolvedValue([]),
      obtenerParametros: jest.fn().mockResolvedValue({
        descuentoPrimeraCompra: '5.00',
        descuentoMaximo: '10.00',
      }),
      actualizarParametros: jest.fn().mockResolvedValue({}),
      ...parcial,
    } as unknown as jest.Mocked<CatalogoAdminRepository>;
    return { repo, servicio: new CatalogoAdminService(repo) };
  }

  it('editarPlan: 404 si no existe', async () => {
    const { servicio } = crear({
      buscarPlan: jest.fn().mockResolvedValue(null),
    });
    await expect(
      servicio.editarPlan('t', 'x', { activo: false }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('editarPlan: solo estado → no llama a editarPlan', async () => {
    const { repo, servicio } = crear();
    const r = await servicio.editarPlan('t', 'p1', { activo: false });
    expect(repo.editarPlan).not.toHaveBeenCalled();
    expect(repo.cambiarEstadoPlan).toHaveBeenCalledWith('t', 'p1', false);
    expect(r.activo).toBe(false);
  });

  it('editarPlan: nombre conserva la descripción vigente', async () => {
    const { repo, servicio } = crear();
    await servicio.editarPlan('t', 'p1', { nombre: 'Plata+' });
    expect(repo.editarPlan).toHaveBeenCalledWith('t', 'p1', 'Plata+', 'Texto');
    expect(repo.cambiarEstadoPlan).not.toHaveBeenCalled();
  });

  it('crearCampo: normaliza valores antes de guardar', async () => {
    const { repo, servicio } = crear();
    await servicio.crearCampo('t', 'a1', {
      nombre: 'clase',
      tipo: 'LISTA',
      obligatorio: false,
      origenValores: 'ESTATICO',
      valores: [' Sedán', 'Sedán', 'SUV'],
    });
    expect(repo.crearCampo).toHaveBeenCalledWith(
      't',
      'a1',
      expect.objectContaining({ valores: ['Sedán', 'SUV'] }),
    );
  });

  it('crearCampo: 400 con errores por campo si la lista no tiene valores', async () => {
    const { repo, servicio } = crear();
    await expect(
      servicio.crearCampo('t', 'a1', {
        nombre: 'clase',
        tipo: 'LISTA',
        obligatorio: false,
        origenValores: 'ESTATICO',
        valores: ['  '],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.crearCampo).not.toHaveBeenCalled();
  });

  it('desactivarCampo: desactiva, no borra (RN-16)', async () => {
    const { repo, servicio } = crear();
    await servicio.desactivarCampo('t', 'c1');
    expect(repo.cambiarEstadoCampo).toHaveBeenCalledWith('t', 'c1', false);
  });

  it('guardarReglas: rechaza aseguradora+uso repetidos', async () => {
    const { repo, servicio } = crear();
    const regla = {
      aseguradoraId: 'a1',
      uso: 'PARTICULAR' as const,
      requiereInspeccion: false,
    };
    await expect(
      servicio.guardarReglas('t', [regla, regla]),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.guardarReglas).not.toHaveBeenCalled();
  });

  it('actualizarParametros: valida contra los descuentos vigentes', async () => {
    const { repo, servicio } = crear();
    await expect(
      servicio.actualizarParametros('t', { descuentoPrimeraCompra: 15 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.actualizarParametros).not.toHaveBeenCalled();
  });

  it('actualizarParametros: sin descuentos no consulta los vigentes', async () => {
    const { repo, servicio } = crear();
    await servicio.actualizarParametros('t', { maxIntentos: 5 });
    expect(repo.obtenerParametros).not.toHaveBeenCalled();
    expect(repo.actualizarParametros).toHaveBeenCalledWith('t', {
      maxIntentos: 5,
    });
  });

  it('actualizarParametros: 400 si no viene nada', async () => {
    const { servicio } = crear();
    await expect(servicio.actualizarParametros('t', {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('DTOs de administración', () => {
  const errores = (cls: new () => object, cuerpo: object) =>
    validateSync(plainToInstance(cls, cuerpo)).length;

  it('CrearCampoDto normaliza el nombre y exige aseguradora', () => {
    const dto = plainToInstance(CrearCampoDto, {
      aseguradoraId: '6f1c2b1e-8a3d-4c2e-9b7a-1d2e3f4a5b6c',
      nombre: ' Numero_Motor ',
      tipo: 'TEXTO',
      obligatorio: true,
    });
    expect(validateSync(dto)).toHaveLength(0);
    expect(dto.nombre).toBe('numero_motor');
    expect(dto.origenValores).toBe('ESTATICO');
    expect(
      errores(CrearCampoDto, { nombre: 'x', tipo: 'TEXTO', obligatorio: true }),
    ).toBe(1);
  });

  it('GuardarReglasDto valida cada regla', () => {
    expect(
      errores(GuardarReglasDto, {
        reglas: [
          { aseguradoraId: 'no-uuid', uso: 'AVION', requiereInspeccion: 'si' },
        ],
      }),
    ).toBe(1);
  });

  it('ActualizarParametrosDto rechaza más de 2 decimales y enteros fuera de rango', () => {
    expect(errores(ActualizarParametrosDto, { descuentoMaximo: 10.555 })).toBe(
      1,
    );
    expect(errores(ActualizarParametrosDto, { maxCuotas: 30 })).toBe(1);
    expect(
      errores(ActualizarParametrosDto, { moneda: 'pen', maxIntentos: 4 }),
    ).toBe(0);
  });
});
