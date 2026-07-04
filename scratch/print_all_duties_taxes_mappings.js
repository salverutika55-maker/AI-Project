const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const clientId = "cmprtm96f0001ju049crqkyre";
  
  const mappings = await prisma.unifiedLedgerMapping.findMany({
    where: { clientId, subHeadName: "Duties & Taxes" }
  });

  console.log(`Found ${mappings.length} mappings for Duties & Taxes:`);
  for (const m of mappings) {
    // Find ledger
    const ledger = await prisma.normalizedLedger.findFirst({
      where: { clientId, name: m.softwareLedgerName }
    });
    console.log(`- Mapped Name: ${m.softwareLedgerName}`);
    if (ledger) {
      console.log(`  Ledger ID: ${ledger.id}, Active: ${ledger.isActive}, DB Closing: ${ledger.closingBalance}, Nature: ${ledger.nature}`);
    } else {
      console.log(`  Ledger NOT FOUND in master list!`);
    }
  }
}

run().catch(console.error).finally(() => prisma.$disconnect());
