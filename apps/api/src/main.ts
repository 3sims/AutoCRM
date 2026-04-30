import { NestFactory } from '@nestjs/core'
import { ValidationPipe, Logger } from '@nestjs/common'
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger'
import { ConfigService } from '@nestjs/config'
import helmet from 'helmet'
import * as compression from 'compression'
import { AppModule } from './app.module'

async function bootstrap() {
  const logger = new Logger('Bootstrap')
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] })

  const config = app.get(ConfigService)
  const port = config.get<number>('PORT', 4000)
  const nodeEnv = config.get<string>('NODE_ENV', 'development')

  // ── Security ──────────────────────────────────────────────────────────────
  app.use(helmet())
  app.use(compression())
  app.enableCors({
    origin: config.get<string>('CORS_ORIGIN', 'http://localhost:3000'),
    credentials: true,
  })

  // ── Validation ────────────────────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,          // strip unknown properties
      forbidNonWhitelisted: true,
      transform: true,          // auto-transform payloads to DTO instances
      transformOptions: { enableImplicitConversion: true },
    })
  )

  // ── API prefix ────────────────────────────────────────────────────────────
  app.setGlobalPrefix('api')

  // ── Swagger (dev only) ────────────────────────────────────────────────────
  if (nodeEnv !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('AutoCRM API')
      .setDescription('B2B SaaS for used car dealerships — Modular NestJS API')
      .setVersion('1.0')
      .addBearerAuth()
      .addTag('auth')
      .addTag('leads')
      .addTag('vehicles')
      .addTag('pipeline')
      .addTag('messaging')
      .addTag('analytics')
      .addTag('billing')
      .addTag('audit')
      .build()

    const document = SwaggerModule.createDocument(app, swaggerConfig)
    SwaggerModule.setup('api/docs', app, document)
    logger.log(`Swagger UI: http://localhost:${port}/api/docs`)
  }

  await app.listen(port)
  logger.log(`AutoCRM API running on http://localhost:${port}/api`)
  logger.log(`Environment: ${nodeEnv}`)
}

bootstrap()
