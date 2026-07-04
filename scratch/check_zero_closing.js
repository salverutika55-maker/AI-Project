const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const path = require('path');
const tracePath = path.resolve(__dirname, '../src/lib/services/balance-sheet-trace');
const { buildBalanceSheetTrace } = require(tracePath);

async function run() {
  const clients = await prisma.client.findMany();
  for (const c of clients) {
    const ledgerCount = await prisma.normalizedLedger.count({ where: { clientId: c.id } });
    if (ledgerCount === 0) continue;

    console.log(`\n======================================================`);
    console.log(`Checking Client: ${c.name} (ID: ${c.id})`);
    console.log(`======================================================`);

    const trace = await buildBalanceSheetTrace(c.id, 2025);
    let count = 0;
    for (const t of trace.ledgerTraces) {
      const dbClosing = t.dbClosingBalance;
      const calcClosing = t.monthTraces.Mar?.closing || 0;
      
      if (dbClosing === 0 && Math.abs(calcClosing) > 0.01) {
        count++;
        console.log(`- ${t.ledgerName} (${t.mainGroup} / ${t.subHeadName})`);
        console.log(`  DB Opening: ${t.dbOpeningBalance}, DB Closing: ${dbClosing}, Nature: ${t.nature}`);
        console.log(`  Opening Calculated: ${t.monthTraces.Opening?.closing}, March Closing Calculated: ${calcClosing}`);
        console.log(`  Opening Source: ${t.openingSource}`);
      }
    }
    console.log(`Anomalous ledgers for this client: ${count}`);
  }
}

run().catch(console.error).finally(() => prisma.$disconnect());
