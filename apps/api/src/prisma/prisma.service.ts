import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private pool: Pool;

  constructor() {
    const connectionString =
      process.env.DATABASE_URL ||
      'postgresql://postgres@localhost:5432/luxtax?schema=public';
    const pool = new Pool({ connectionString });
    const adapter = new PrismaPg(pool);
    super({
      adapter,
      // Query logging prints the bound values — e-mails, amounts, token hashes —
      // so it is opt-in even in development rather than switched on by NODE_ENV
      // (M6). Set PRISMA_LOG_QUERIES=true when a query actually needs debugging.
      log: process.env.PRISMA_LOG_QUERIES === 'true'
        ? ['query', 'info', 'warn', 'error']
        : ['error'],
    });
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
