import {
  type MiddlewareConsumer,
  Module,
  type NestModule,
} from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { CommonModule } from './common/common.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { RolesGuard } from './common/guards/roles.guard';
import { SupabaseAuthGuard } from './common/guards/supabase-auth.guard';
import { SanitizeResponseInterceptor } from './common/interceptors/sanitize-response.interceptor';
import { TimeoutInterceptor } from './common/interceptors/timeout.interceptor';
import { CorrelationIdMiddleware } from './common/middlewares/correlation-id.middleware';
import { crearValidationPipe } from './common/pipes/validation.pipe';
import { validateEnv } from './config/env.validation';
import { DatabaseModule } from './infrastructure/database/database.module';
import { HealthController } from './infrastructure/observability/health.controller';
import { IntegracionModule } from './integracion/integracion.module';
import { SeguridadModule } from './modules/seguridad/seguridad.module';
import { AdministracionModule } from './modules/administracion/administracion.module';
import { CotizacionModule } from './modules/cotizacion/cotizacion.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    // Perfil general 100 req/min por IP; /auth/* baja a 20 con @Throttle (§3.2).
    // Memoria mientras haya una sola instancia; Redis al escalar (§4.6).
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: 100 }],
      errorMessage:
        'Demasiadas solicitudes. Espera un momento e intenta de nuevo.',
    }),
    DatabaseModule,
    CommonModule,
    IntegracionModule,
    SeguridadModule,
    AdministracionModule,
    CotizacionModule,
  ],
  controllers: [HealthController],
  providers: [
    // Guards globales en este orden: rate limit → autenticación → rol + activo.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useExisting: SupabaseAuthGuard },
    { provide: APP_GUARD, useExisting: RolesGuard },
    { provide: APP_PIPE, useFactory: crearValidationPipe },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: TimeoutInterceptor },
    { provide: APP_INTERCEPTOR, useClass: SanitizeResponseInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware).forRoutes('{*path}');
  }
}
