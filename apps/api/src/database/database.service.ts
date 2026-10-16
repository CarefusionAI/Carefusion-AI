import { Injectable, OnModuleDestroy } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Pool, PoolClient } from 'pg'

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly pool: Pool

  constructor(config: ConfigService) {
    this.pool = new Pool({
      connectionString: config.get<string>('DATABASE_URL'),
      max: 10,
    })
  }

  async onModuleDestroy() {
    await this.pool.end()
  }

  async query<T = any>(text: string, params?: any[]): Promise<T[]> {
    const result = await this.pool.query(text, params)
    return result.rows as T[]
  }

  async getClient(): Promise<PoolClient> {
    return this.pool.connect()
  }
}
