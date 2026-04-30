import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Express } from 'express'
import { AppModule } from './app.module'

let cachedApp: Express | null = null

async function bootstrap(): Promise<Express> {
  const nest = await NestFactory.create(AppModule, { logger: ['error', 'warn'] })
  const config = nest.get(ConfigService)

  nest.enableCors({ origin: config.get('CORS_ORIGIN', '*'), credentials: true })
  nest.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    })
  )
  // Pas de prefix — Vercel rewrites gère le routing
  await nest.init()

  return nest.getHttpAdapter().getInstance() as Express
}

export default async (req: any, res: any) => {
  try {
    if (!cachedApp) cachedApp = await bootstrap()
    cachedApp(req, res)
  } catch (err: any) {
    console.error('[serverless] bootstrap failed:', err?.message, err?.stack)
    res.statusCode = 500
    res.end(JSON.stringify({ error: 'Server initialization failed', detail: err?.message }))
  }
}