import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { ObtenerResumenUseCase } from '../../cotizacion/application/cotizaciones.use-cases';
import {
  CONTENIDO_PLAN_REPOSITORY,
  type ContenidoPlanRepository,
} from '../../planes/domain/contenido-plan.repository.port';
import {
  armarContexto,
  armarInstrucciones,
  validarRespuesta,
  type MensajeChat,
  type RespuestaAsistente,
  type VehiculoMencionado,
} from '../domain/asistente';
import {
  ASISTENTE_CONVERSACIONAL,
  type AsistenteConversacional,
} from '../domain/asistente-conversacional.port';

export interface ConversarEntrada {
  mensajes: MensajeChat[];
  vehiculo?: VehiculoMencionado;
  /** Si viene, el controlador ya comprobó el acceso a esa cotización. */
  cotizacionId?: string;
}

/**
 * Un turno del chatbot. Junta el contenido publicado de los planes (y los
 * precios de la cotización, si hay), se lo pasa al proveedor de IA y filtra
 * lo que este contesta. No escribe en la base ni guarda la conversación.
 */
@Injectable()
export class ConversarUseCase {
  constructor(
    @Inject(ASISTENTE_CONVERSACIONAL)
    private readonly asistente: AsistenteConversacional,
    @Inject(CONTENIDO_PLAN_REPOSITORY)
    private readonly contenido: ContenidoPlanRepository,
    private readonly resumen: ObtenerResumenUseCase,
  ) {}

  async ejecutar(entrada: ConversarEntrada): Promise<RespuestaAsistente> {
    const ultimo = entrada.mensajes.at(-1);
    if (!ultimo || ultimo.rol !== 'usuario') {
      throw new BadRequestException(
        'El último mensaje debe ser el de la persona',
      );
    }

    const [{ planes }, cotizacion] = await Promise.all([
      this.contenido.publicado(),
      entrada.cotizacionId
        ? // false: sin desglose de cálculo (RN-41), sea quien sea.
          this.resumen
            .ejecutar(entrada.cotizacionId, false)
            .then((r) => r.cotizacion)
        : null,
    ]);

    const ctx = armarContexto(
      [...planes.values()],
      cotizacion,
      entrada.vehiculo,
    );
    const cruda = await this.asistente.responder({
      instrucciones: armarInstrucciones(ctx),
      mensajes: entrada.mensajes,
      clavesPlanes: ctx.planes.map((p) => p.clave),
    });
    return validarRespuesta(cruda, ctx);
  }
}
