const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const path = require('path');
const tracePath = path.resolve(__dirname, '../src/lib/services/balance-sheet-trace');
const { buildBalanceSheetTrace } = require(tracePath);

async function runForClient(clientId, clientName) {
  console.log(`\n======================================================`);
  console.log(`CLIENT: ${clientName} (ID: ${clientId})`);
  console.log(`======================================================`);
  
  const trace = await buildBalanceSheetTrace(clientId, 2024);

  const targetNames = ["Gst Tax Account", "GST Tax Account", "GST Tax", "Income Tax Account", "Income Tax", "Ajit Pathak"];
  const targetTraces = trace.ledgerTraces.filter(t => targetNames.some(tn => tn.toLowerCase() === t.ledgerName.toLowerCase()));

  console.log("\n--- Monthly Trace Details ---");
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

  console.log("\n--- DataNodes in Payload ---");
  const targetNodes = trace.dataNodes.filter(n => targetNames.some(tn => tn.toLowerCase() === n.ledgerName.toLowerCase()) && ["Apr", "May", "Mar"].includes(n.period));
  for (const n of targetNodes) {
    console.log(`- Ledger: ${n.ledgerName}, Month: ${n.period}, Amount: ${n.amount}, Nature: ${n.nature}, Opening: ${n.opening}, Debit: ${n.debit}, Credit: ${n.credit}, Closing: ${n.closing}`);
  }
}

async function run() {
  const clients = await prisma.client.findMany();
  for (const c of clients) {
    const ledgerCount = await prisma.normalizedLedger.count({ where: { clientId: c.id } });
    if (ledgerCount > 0) {
      await runForClient(c.id, c.name);
    }
  }
}

run().catch(console.error).finally(() => prisma.$disconnect());
