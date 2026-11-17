import { Inject, Injectable } from '@nestjs/common';
import {
  CATALOGO_PUBLICO_REPOSITORY,
  type CatalogoPublicoRepository,
} from '../domain/catalogo-publico.port';
import {
  RECONOCEDOR_VEHICULO,
  type ImagenVehiculo,
  type ReconocedorVehiculo,
} from '../domain/reconocedor-vehiculo.port';

export interface VehiculoReconocido {
  reconocido: boolean;
  marca?: { id: string; nombre: string };
  modelo?: { id: string; nombre: string };
  /** Años del rango estimado que además tienen cobertura (del más nuevo al más viejo). */
  aniosProbables: number[];
  confianza: number;
}

const NO_RECONOCIDO: VehiculoReconocido = {
  reconocido: false,
  aniosProbables: [],
  confianza: 0,
};

/** "Hilux" y "hilux " y "HÍLUX" son lo mismo. */
export const normalizar = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * Foto → marca, modelo y años del catálogo. El reconocedor solo elige entre
 * lo que existe en la base: lo que no esté, no se inventa ni se crea. El
 * resultado es una sugerencia; el cliente siempre confirma.
 */
@Injectable()
export class ReconocerVehiculoUseCase {
  constructor(
    @Inject(RECONOCEDOR_VEHICULO)
    private readonly reconocedor: ReconocedorVehiculo,
    @Inject(CATALOGO_PUBLICO_REPOSITORY)
    private readonly catalogo: CatalogoPublicoRepository,
  ) {}

  async ejecutar(imagen: ImagenVehiculo): Promise<VehiculoReconocido> {
    const marcas = await this.catalogo.marcas();
    const conModelos = await Promise.all(
      marcas.map(async (m) => ({
        marca: m,
        modelos: await this.catalogo.modelos(m.id),
      })),
    );

    const crudo = await this.reconocedor.reconocer(
      imagen,
      conModelos.map((c) => ({
        marca: c.marca.nombre,
        modelos: c.modelos.map((m) => m.nombre),
      })),
    );
    if (!crudo.marca || !crudo.modelo) return NO_RECONOCIDO;

    const marcaBuscada = normalizar(crudo.marca);
    const modeloBuscado = normalizar(crudo.modelo);
    const entrada = conModelos.find(
      (c) => normalizar(c.marca.nombre) === marcaBuscada,
    );
    const modelo = entrada?.modelos.find(
      (m) => normalizar(m.nombre) === modeloBuscado,
    );
    if (!entrada || !modelo) return NO_RECONOCIDO;

    const disponibles = await this.catalogo.anios(modelo.id);
    const desde = crudo.anioDesde ?? crudo.anioHasta;
    const hasta = crudo.anioHasta ?? crudo.anioDesde;
    const aniosProbables =
      desde === null || hasta === null
        ? []
        : disponibles.filter((a) => a >= desde && a <= hasta);

    return {
      reconocido: true,
      marca: { id: entrada.marca.id, nombre: entrada.marca.nombre },
      modelo: { id: modelo.id, nombre: modelo.nombre },
      aniosProbables,
      confianza: crudo.confianza,
    };
  }
}
