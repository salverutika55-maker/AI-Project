const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const path = require('path');
const tracePath = path.resolve(__dirname, '../src/lib/services/balance-sheet-trace');
const { buildBalanceSheetTrace } = require(tracePath);

async function run() {
  const clientId = "cmprtm96f0001ju049crqkyre";
  const client = await prisma.client.findUnique({
    where: { id: clientId }
  });
  if (!client) {
    console.log("No client found");
    return;
  }
  console.log(`Using Client: ${client.name} (ID: ${client.id})`);

  const trace = await buildBalanceSheetTrace(client.id, 2025);

  const dutiesTaxesTraces = trace.ledgerTraces.filter(t => t.subHeadName === "Duties & Taxes");

  console.log(`\nFound ${dutiesTaxesTraces.length} ledgers in Duties & Taxes:`);
  let sumExpected = 0;
  for (const t of dutiesTaxesTraces) {
    const marchClosing = t.monthTraces.Mar?.closing || 0;
    console.log(`- ${t.ledgerName}: March Closing = ${marchClosing}, Opening = ${t.monthTraces.Opening?.closing}, Nature = ${t.nature}`);
    sumExpected += marchClosing;
  }
  console.log(`Sum of eligible ledger balances (Expected Subhead Total) = ${sumExpected}`);

  const subheadDiag = trace.subheadDiagnostics.find(d => d.subHeadName === "Duties & Taxes");
  if (subheadDiag) {
    console.log(`\nSubhead Diagnostics for Duties & Taxes:`);
    console.log(`  Calculated Total: ${subheadDiag.calculatedTotal}`);
    console.log(`  Displayed Total:  ${subheadDiag.displayedTotal}`);
    console.log(`  Variance:         ${subheadDiag.variance}`);
  }
}

run().catch(console.error).finally(() => prisma.$disconnect());
