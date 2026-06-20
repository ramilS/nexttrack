import { Inject, Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { databaseConfig } from '@/config';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly pool: Pool;

  constructor(
    @Inject(databaseConfig.KEY)
    dbConfig: ConfigType<typeof databaseConfig>,
  ) {
    const pool = new Pool({
      connectionString: dbConfig.url,
      min: dbConfig.poolMin,
      max: dbConfig.poolMax,
      connectionTimeoutMillis: dbConfig.connectionTimeoutMs,
      idleTimeoutMillis: dbConfig.idleTimeoutMs,
    });
    const adapter = new PrismaPg(pool);
    super({ adapter });
    this.pool = pool;
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
    await this.pool.end();
  }
}
