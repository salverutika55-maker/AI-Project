const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const clientId = "cmprtm96f0001ju049crqkyre";
  const nonZeroOp = await prisma.normalizedLedger.findMany({
    where: { clientId, openingBalance: { gt: 0 } }
  });
  console.log(`Found ${nonZeroOp.length} ledgers with openingBalance > 0 in DB:`);
  for (const l of nonZeroOp) {
    console.log(`- Name: ${l.name}, Opening: ${l.openingBalance}, Nature: ${l.nature}`);
  }
}

run().catch(console.error).finally(() => prisma.$disconnect());
