import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { TestAppModule } from './test-app.module'

async function bootstrap() {
  const app = await NestFactory.create(TestAppModule)
  const port = Number(process.env.PORT ?? 3055)
  await app.listen(port, '127.0.0.1')
  console.log(`citizen-app test API on ${port}`)
}

void bootstrap()
