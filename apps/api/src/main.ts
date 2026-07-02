import './tracing';
import { NestFactory } from '@nestjs/core';
import { ConfigType } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import { Logger as PinoLogger } from 'nestjs-pino';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { appConfig, websocketConfig } from './config';
import { WsAdapter } from './common/adapters/ws.adapter';
import { ValkeyService } from './valkey/valkey.service';
import { configureApp } from './bootstrap/configure-app';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    abortOnError: false,
    bufferLogs: true,
    // Body parsers (with a raised limit) are registered in configureApp so the
    // limit is identical in prod and the test harness. Disable Nest's built-in
    // 100kb parser to avoid a second, stricter parser running first.
    bodyParser: false,
  });

  app.useLogger(app.get(PinoLogger));

  const config = app.get<ConfigType<typeof appConfig>>(appConfig.KEY);
  const wsConfig = app.get<ConfigType<typeof websocketConfig>>(
    websocketConfig.KEY,
  );
  const logger = new Logger('Bootstrap');

  app.enableShutdownHooks();
  configureApp(app);
  app.enableCors({
    origin: config.webUrl,
    credentials: true,
  });
  // Deployment-only routing concern — intentionally not in `configureApp`, so
  // it is not mirrored into the test harness (see configure-app.ts).
  app.setGlobalPrefix('api');

  const corsOrigins = wsConfig.corsOrigins.split(',').map((o) => o.trim());
  const redisClient = app.get(ValkeyService).getClient();
  app.useWebSocketAdapter(new WsAdapter(app, corsOrigins, redisClient));

  if (config.swaggerEnabled) {
    const docConfig = new DocumentBuilder()
      .setTitle('NextTrack API')
      .setVersion('1.0')
      .addCookieAuth('access_token')
      .build();
    const document = SwaggerModule.createDocument(app, docConfig);
    SwaggerModule.setup('docs', app, cleanupOpenApiDoc(document));
  }

  await app.listen(config.port);
  logger.log(`API running on http://localhost:${config.port}`);
  if (config.swaggerEnabled) {
    logger.log(`Swagger UI at http://localhost:${config.port}/docs`);
  }
}
bootstrap().catch((err) => {
  // Pino may not be initialized if bootstrap fails, use console as fallback
  console.error(`Application failed to start: ${err.message}`, err.stack);
  process.exit(1);
});
