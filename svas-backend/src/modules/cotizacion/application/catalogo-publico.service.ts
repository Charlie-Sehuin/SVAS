import { Inject, Injectable } from '@nestjs/common';
import {
  CATALOGO_PUBLICO_REPOSITORY,
  type CatalogoPublicoRepository,
} from '../domain/catalogo-publico.port';
import { unirCampos } from '../domain/formulario-dinamico';

/** Lo que el formulario de cotización necesita (doc conexión §4, RN-17). */
@Injectable()
export class CatalogoPublicoService {
  constructor(
    @Inject(CATALOGO_PUBLICO_REPOSITORY)
    private readonly repo: CatalogoPublicoRepository,
  ) {}

  async campos() {
    const [aseguradoras, campos] = await Promise.all([
      this.repo.aseguradorasActivas(),
      this.repo.camposActivos(),
    ]);
    return {
      aseguradoras: aseguradoras.map((a) => ({ id: a.id, nombre: a.nombre })),
      campos: unirCampos(campos),
    };
  }

  marcas() {
    return this.repo.marcas();
  }
  modelos(marcaId: string) {
    return this.repo.modelos(marcaId);
  }
  anios(modeloId: string) {
    return this.repo.anios(modeloId);
  }
  async departamentos() {
    return (await this.repo.departamentos()).map((departamento) => ({
      departamento,
    }));
  }
  async provincias(departamento: string) {
    return (await this.repo.provincias(departamento)).map((provincia) => ({
      provincia,
    }));
  }
  distritos(departamento: string, provincia: string) {
    return this.repo.distritos(departamento, provincia);
  }
}
