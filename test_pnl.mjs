import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
  const pnl = await prisma.pNLValue.findMany({
      take: 10
  });
  console.log("Sample PNL:", pnl.map(p => p.headName));
}

run().catch(console.error).finally(() => prisma.$disconnect());
