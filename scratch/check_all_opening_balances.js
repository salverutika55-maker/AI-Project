const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const allLedgers = await prisma.normalizedLedger.findMany({
    where: { openingBalance: { gt: 0 } },
    include: { client: true }
  });
  console.log(`Found ${allLedgers.length} ledgers in DB with openingBalance > 0:`);
  for (const l of allLedgers) {
    console.log(`- Client: ${l.client.name} (ID: ${l.clientId}), Ledger: ${l.name}, Opening: ${l.openingBalance}, Nature: ${l.nature}`);
  }
}

run().catch(console.error).finally(() => prisma.$disconnect());
