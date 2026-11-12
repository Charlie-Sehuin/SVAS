import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import type { Env } from './config/env.validation';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  // Railway está detrás de un proxy: necesario para ver la IP real (throttler).
  app.set('trust proxy', 1);
  app.use(helmet());
  app.setGlobalPrefix('api/v1');
  app.enableCors({
    origin: config.get('FRONTEND_URL', { infer: true }),
    exposedHeaders: ['X-Correlation-Id'],
  });
  app.enableShutdownHooks();

  await app.listen(config.get('PORT', { infer: true }));
}
void bootstrap();
