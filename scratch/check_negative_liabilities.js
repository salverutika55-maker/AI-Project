const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const path = require('path');
const tracePath = path.resolve(__dirname, '../src/lib/services/balance-sheet-trace');
const { buildBalanceSheetTrace } = require(tracePath);

async function run() {
  const clientId = "cmprtm96f0001ju049crqkyre";
  const trace = await buildBalanceSheetTrace(clientId, 2025);

  console.log("=== LIABILITY LEDGERS WITH NEGATIVE MARCH CLOSING ===");
  let count = 0;
  for (const t of trace.ledgerTraces) {
    if (t.mainGroup === "Liabilities") {
      const calcClosing = t.monthTraces.Mar?.closing || 0;
      if (calcClosing < -0.01) {
        count++;
        console.log(`- ${t.ledgerName} (${t.subHeadName})`);
        console.log(`  DB Opening: ${t.dbOpeningBalance}, DB Closing: ${t.dbClosingBalance}, Nature: ${t.nature}`);
        console.log(`  Opening Calculated: ${t.monthTraces.Opening?.closing}, March Closing Calculated: ${calcClosing}`);
      }
    }
  }
  console.log(`\nTotal negative liability ledgers: ${count}`);
}

run().catch(console.error).finally(() => prisma.$disconnect());
