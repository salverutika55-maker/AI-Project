const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const path = require('path');
const tracePath = path.resolve(__dirname, '../src/lib/services/balance-sheet-trace');
const { buildBalanceSheetTrace } = require(tracePath);

async function run() {
  const clients = await prisma.client.findMany();
  for (const c of clients) {
    const ledgers = await prisma.normalizedLedger.findMany({
      where: { clientId: c.id, groupName: { contains: "Duties & Taxes", mode: "insensitive" } }
    });
    if (ledgers.length === 0) continue;

    console.log(`\n======================================================`);
    console.log(`Client: ${c.name} (ID: ${c.id})`);
    console.log(`======================================================`);

    const trace = await buildBalanceSheetTrace(c.id, 2025);
    for (const l of ledgers) {
      const lt = trace.ledgerTraces.find(t => t.ledgerId === l.id);
      if (lt) {
        console.log(`- Ledger: ${l.name}`);
        console.log(`  DB Opening: ${l.openingBalance}, DB Closing: ${l.closingBalance}, Nature: ${l.nature}`);
        console.log(`  Calc Opening (March): ${lt.monthTraces.Opening?.closing}, Calc Closing (March): ${lt.monthTraces.Mar?.closing}`);
      } else {
        console.log(`- Ledger: ${l.name} (NOT IN TRACE - Mapped: ${l.isActive ? 'Yes (No mapping)' : 'Inactive'})`);
      }
    }
  }
}

run().catch(console.error).finally(() => prisma.$disconnect());
