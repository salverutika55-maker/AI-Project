const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const path = require('path');
const tracePath = path.resolve(__dirname, '../src/lib/services/balance-sheet-trace');
const { buildBalanceSheetTrace } = require(tracePath);

async function run() {
  const clientId = "cmprtm96f0001ju049crqkyre";
  const trace = await buildBalanceSheetTrace(clientId, 2025);

  const t = trace.ledgerTraces.find(x => x.ledgerName === "Gst Tax Account");
  if (t) {
    console.log(`Monthly trace for Gst Tax Account in FY 2025:`);
    for (const m of ["Opening", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"]) {
      const mt = t.monthTraces[m];
      if (mt) {
        console.log(`- ${m.padEnd(7)}: Op=${mt.opening.toFixed(2).padStart(10)}, Dr=${mt.debit.toFixed(2).padStart(10)}, Cr=${mt.credit.toFixed(2).padStart(10)}, Cl=${mt.closing.toFixed(2).padStart(10)}`);
      }
    }
  }
}

run().catch(console.error).finally(() => prisma.$disconnect());
