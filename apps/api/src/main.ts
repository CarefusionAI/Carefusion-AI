import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  // Allow the Vite dev server (and later the Vercel web app) to call the API.
  app.enableCors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173' })
  const port = Number(process.env.PORT ?? 3000)
  await app.listen(port, '0.0.0.0')
  console.log(`carefusion-api listening on port ${port}`)
}

void bootstrap()
