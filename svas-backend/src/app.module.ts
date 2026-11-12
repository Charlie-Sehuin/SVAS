import {
  type MiddlewareConsumer,
  Module,
  type NestModule,
} from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { RolesGuard } from './common/guards/roles.guard';
import {
  jwtKeyResolverProvider,
  SupabaseAuthGuard,
} from './common/guards/supabase-auth.guard';
import { SanitizeResponseInterceptor } from './common/interceptors/sanitize-response.interceptor';
import { TimeoutInterceptor } from './common/interceptors/timeout.interceptor';
import { CorrelationIdMiddleware } from './common/middlewares/correlation-id.middleware';
import { crearValidationPipe } from './common/pipes/validation.pipe';
import { validateEnv } from './config/env.validation';
import { DatabaseModule } from './infrastructure/database/database.module';
import { HealthController } from './infrastructure/observability/health.controller';
import { WhoamiController } from './infrastructure/observability/whoami.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    DatabaseModule,
  ],
  controllers: [HealthController, WhoamiController],
  providers: [
    jwtKeyResolverProvider,
    // Guards globales, en este orden: primero autenticación, luego rol + activo.
    { provide: APP_GUARD, useClass: SupabaseAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
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
