const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const ledgers = await prisma.normalizedLedger.findMany();
  console.log("Total Normalized Ledgers:", ledgers.length);
  
  if (ledgers.length > 0) {
      console.log("Sample ledgers:");
      console.log(ledgers.slice(0, 10).map(l => ({ name: l.name, bal: l.closingBalance })));
  }
}

run().finally(() => prisma.$disconnect());
