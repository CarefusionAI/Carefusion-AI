import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'

// Serverless entry (Vercel): builds the Nest app once per warm instance and returns the Express handler.
// The long-running entry for Docker and local development stays in main.ts.
export async function createApp() {
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] })
  app.enableCors({ origin: process.env.WEB_ORIGIN ?? true })
  await app.init()
  return app.getHttpAdapter().getInstance()
}
