import compression from 'compression';
import helmet from 'helmet';
import { Logger, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';

/**
 * Bootstraps the Cordelê HTTP application.
 *
 * Global concerns wired here (and nowhere else):
 *  - security headers (helmet) and response compression
 *  - CORS, driven by the CORS_ORIGINS environment variable
 *  - strict validation/transformation of every inbound payload
 *  - URI versioning (/api/v1/...)
 *  - OpenAPI document exposed at /api/docs
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  app.use(helmet());
  app.use(compression());

  const corsOrigins = (config.get<string>('CORS_ORIGINS') ?? '*')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  app.enableCors({
    origin: corsOrigins.includes('*') ? true : corsOrigins,
    credentials: true,
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Correlation-Id', 'X-Tenant-Id'],
  });

  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.enableShutdownHooks();

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Cordelê API')
    .setDescription('O Cordelê é uma plataforma SaaS B2B para transformar manuscritos, textos e arquivos Markdown em publicações digitais ePub válidas, sem necessidade de diagramação manual ou ferramentas técnicas especializadas.')
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'bearer')
    .addGlobalParameters({
      name: 'X-Tenant-Id',
      in: 'header',
      required: false,
      description: 'Overrides the empresa resolved from the access token.',
    })
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  const port = Number(config.get<string>('PORT') ?? 3000);
  await app.listen(port, '0.0.0.0');

  logger.log(`cordele listening on port ${port}`);
  logger.log(`OpenAPI available at http://localhost:${port}/api/docs`);
}

void bootstrap();
