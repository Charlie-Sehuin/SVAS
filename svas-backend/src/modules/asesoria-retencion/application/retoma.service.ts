import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { generarToken, sha256Hex } from '../../../common/utils/token.util';
import {
  ASESORIA_REPOSITORY,
  type AsesoriaRepository,
} from '../domain/asesoria.repository.port';
import { FORMATO_TOKEN_RETOMA } from '../domain/mensajes';

/**
 * GET /retoma/:token (RPC 6.11). El enlace es de un solo uso: al resolverlo
 * se emite un tokenAcceso NUEVO para la cotización (el anterior deja de
 * servir) y se devuelve una sola vez, igual que en POST /cotizaciones.
 */
@Injectable()
export class RetomaService {
  constructor(
    @Inject(ASESORIA_REPOSITORY) private readonly repo: AsesoriaRepository,
  ) {}

  async resolver(token: string) {
    // Un token mal formado no llega a la base.
    if (!FORMATO_TOKEN_RETOMA.test(token)) {
      throw new NotFoundException('Este enlace no es válido');
    }
    const tokenAcceso = generarToken();
    const r = await this.repo.resolverRetoma(
      sha256Hex(token),
      sha256Hex(tokenAcceso),
    );
    return {
      cotizacionId: r.cotizacionId,
      tokenAcceso,
      descuento: r.descuento,
    };
  }
}
