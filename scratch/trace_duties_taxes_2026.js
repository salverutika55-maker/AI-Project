const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const path = require('path');
const tracePath = path.resolve(__dirname, '../src/lib/services/balance-sheet-trace');
const { buildBalanceSheetTrace } = require(tracePath);

async function run() {
  const clientId = "cmprtm96f0001ju049crqkyre";
  const trace = await buildBalanceSheetTrace(clientId, 2026);

  const targetNames = ["Gst Tax Account", "Income Tax Account"];
  const targetTraces = trace.ledgerTraces.filter(t => targetNames.some(tn => tn.toLowerCase() === t.ledgerName.toLowerCase()));

  console.log("\n--- Monthly Trace Details for FY 2026 ---");
  for (const t of targetTraces) {
    console.log(`\nLedger: ${t.ledgerName} (${t.mainGroup})`);
    console.log(`  Opening Source: ${t.openingSource}`);
    console.log(`  DB Opening Balance: ${t.dbOpeningBalance}, DB Closing Balance: ${t.dbClosingBalance}, DB Nature: ${t.nature}`);
    console.log("  Monthly Balances:");
    for (const m of ["Opening", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"]) {
      const mt = t.monthTraces[m];
      if (mt) {
        console.log(`    ${m.padEnd(7)}: Op=${mt.opening.toFixed(2).padStart(10)}, Dr=${mt.debit.toFixed(2).padStart(10)}, Cr=${mt.credit.toFixed(2).padStart(10)}, Cl=${mt.closing.toFixed(2).padStart(10)}`);
      }
    }
  }
}

run().catch(console.error).finally(() => prisma.$disconnect());
