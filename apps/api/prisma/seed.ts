import 'dotenv/config';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../src/generated/prisma/client';
import { runSeed } from './seed/run-seed';

/** Baseline seed entry point: `pnpm --filter @meki/api db:seed`. Safe to re-run (create-only). */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const prisma = new PrismaClient({ adapter: new PrismaMariaDb(url) });
  try {
    await runSeed(prisma, (m) => console.log(m));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
