import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'error', 'warn', 'debug', 'verbose'],
    rawBody: true
  });

  const origins =
    process.env.DASHBOARD_ORIGIN?.split(',').map((s) => s.trim()).filter(Boolean) ??
    ['http://localhost:3001', 'http://localhost:3000'];

  app.enableCors({
    origin: origins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  });

  app.setGlobalPrefix('api');

  await app.listen(process.env.PORT || 3000);
}

bootstrap();

