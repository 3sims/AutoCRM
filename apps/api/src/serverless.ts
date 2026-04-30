import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import helmet from 'helmet'
import * as compression from 'compression'
import type { Express } from 'express'
import { AppModule } from './app.module'

let cachedApp: Express | null = null

async function bootstrap(): Promise<Express> {
  const nest = await NestFactory.create(AppModule, { logger: false })
  const config = nest.get(ConfigService)

  nest.use(helmet())
  nest.use(compression())
  nest.enableCors({ origin: config.get('CORS_ORIGIN', '*'), credentials: true })
  nest.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    })
  )
  nest.setGlobalPrefix('api')
  await nest.init()

  return nest.getHttpAdapter().getInstance() as Express
}

export default async (req: any, res: any) => {
  if (!cachedApp) cachedApp = await bootstrap()
  cachedApp(req, res)
}
