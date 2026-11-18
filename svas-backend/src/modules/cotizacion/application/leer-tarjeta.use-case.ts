import { Inject, Injectable } from '@nestjs/common';
import {
  CATALOGO_PUBLICO_REPOSITORY,
  type CatalogoPublicoRepository,
} from '../domain/catalogo-publico.port';
import {
  LECTOR_TARJETA,
  type ArchivoTarjeta,
  type LectorTarjeta,
} from '../domain/lector-tarjeta.port';
import { normalizar } from './reconocer-vehiculo.use-case';

export interface TarjetaLeida {
  leida: boolean;
  marca?: { id: string; nombre: string };
  modelo?: { id: string; nombre: string };
  anio?: number;
  /** Solo si hay modelo y año: true si alguna aseguradora cotiza ese año. */
  anioCotizable?: boolean;
  placa?: string;
}

const NO_LEIDA: TarjetaLeida = { leida: false };

/** Misma regla que el formulario (`VehiculoCotizarDto.placa`), ya sin guion. */
const FORMATO_PLACA = /^[A-Z0-9]{3}[0-9]{3}$/;

/**
 * Tarjeta de propiedad (foto o PDF) → placa, marca, modelo y año. Marca y
 * modelo solo se aceptan si existen en el catálogo; nada se inventa ni se
 * crea. Es un autocompletado: POST /cotizaciones valida todo igual que hoy.
 */
@Injectable()
export class LeerTarjetaUseCase {
  constructor(
    @Inject(LECTOR_TARJETA) private readonly lector: LectorTarjeta,
    @Inject(CATALOGO_PUBLICO_REPOSITORY)
    private readonly catalogo: CatalogoPublicoRepository,
  ) {}

  async ejecutar(archivo: ArchivoTarjeta): Promise<TarjetaLeida> {
    const marcas = await this.catalogo.marcas();
    const conModelos = await Promise.all(
      marcas.map(async (m) => ({
        marca: m,
        modelos: await this.catalogo.modelos(m.id),
      })),
    );

    const crudo = await this.lector.leer(
      archivo,
      conModelos.map((c) => ({
        marca: c.marca.nombre,
        modelos: c.modelos.map((m) => m.nombre),
      })),
    );

    const placa = this.placa(crudo.placa);
    const marcaBuscada = crudo.marca ? normalizar(crudo.marca) : null;
    const modeloBuscado = crudo.modelo ? normalizar(crudo.modelo) : null;
    const entrada = marcaBuscada
      ? conModelos.find((c) => normalizar(c.marca.nombre) === marcaBuscada)
      : undefined;
    const modelo =
      entrada && modeloBuscado
        ? entrada.modelos.find((m) => normalizar(m.nombre) === modeloBuscado)
        : undefined;

    // Sin nada que autocompletar, no es una tarjeta (o no se pudo leer).
    if (!entrada && !placa) return NO_LEIDA;

    const respuesta: TarjetaLeida = { leida: true };
    if (entrada) {
      respuesta.marca = { id: entrada.marca.id, nombre: entrada.marca.nombre };
    }
    if (modelo) {
      respuesta.modelo = { id: modelo.id, nombre: modelo.nombre };
    }
    if (crudo.anio !== null && Number.isInteger(crudo.anio)) {
      respuesta.anio = crudo.anio;
      if (modelo) {
        const disponibles = await this.catalogo.anios(modelo.id);
        respuesta.anioCotizable = disponibles.includes(crudo.anio);
      }
    }
    if (placa) respuesta.placa = placa;
    return respuesta;
  }

  /** Mayúsculas, sin guiones ni espacios; "EN TRÁMITE" o formatos raros se omiten. */
  private placa(texto: string | null): string | undefined {
    if (!texto) return undefined;
    const limpia = texto.toUpperCase().replace(/[\s-]+/g, '');
    return FORMATO_PLACA.test(limpia) ? limpia : undefined;
  }
}
