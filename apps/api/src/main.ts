import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { applySecurity } from './security'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  // Only the web app's origin may call the API from a browser (the Vite dev server by default).
  applySecurity(app, process.env.WEB_ORIGIN ?? 'http://localhost:5173')
  const port = Number(process.env.PORT ?? 3000)
  await app.listen(port, '0.0.0.0')
  console.log(`carefusion-api listening on port ${port}`)
}

void bootstrap()
