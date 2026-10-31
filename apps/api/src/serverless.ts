import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { applySecurity } from './security'

// Serverless entry (Vercel): builds the Nest app once per warm instance and returns the Express handler.
// The long-running entry for Docker and local development stays in main.ts.
export async function createApp() {
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] })
  // Web and API share one host on Vercel, so same-origin only unless WEB_ORIGIN says otherwise.
  applySecurity(app, process.env.WEB_ORIGIN ?? false)
  await app.init()
  return app.getHttpAdapter().getInstance()
}
