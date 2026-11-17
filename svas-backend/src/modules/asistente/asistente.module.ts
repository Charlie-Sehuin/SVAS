import { Module } from '@nestjs/common';
import { IntegracionModule } from '../../integracion/integracion.module';
import { CotizacionModule } from '../cotizacion/cotizacion.module';
import { PlanesModule } from '../planes/planes.module';
import { ConversarUseCase } from './application/conversar.use-case';
import { AsistenteController } from './presentation/asistente.controller';

/**
 * Chatbot del sitio público: recomienda planes y responde dudas con el
 * contenido publicado (planes) y los precios de la cotización (cotizacion).
 * El proveedor de IA entra por el puerto ASISTENTE_CONVERSACIONAL (integracion).
 * Sin tablas ni migraciones: la conversación no se guarda.
 */
@Module({
  imports: [IntegracionModule, PlanesModule, CotizacionModule],
  controllers: [AsistenteController],
  providers: [ConversarUseCase],
})
export class AsistenteModule {}
