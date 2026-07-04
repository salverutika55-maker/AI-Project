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

  // Build the live balance sheet trace
  const trace = await buildBalanceSheetTrace(client.id, 2025);

  console.log("\n--- LEDGERS SUMMARY IN TRACE ---");
  for (const t of trace.ledgerTraces) {
    const calcCl = t.monthTraces.Mar?.closing || 0;
    const mapped = trace.mappings.find(m => m.softwareLedgerName.trim().toLowerCase() === t.ledgerName.trim().toLowerCase());
    const mappedText = mapped ? `${mapped.statementType} -> ${mapped.groupName} -> ${mapped.subHeadName}` : "UNMAPPED";
    
    console.log(`Name: ${t.ledgerName.padEnd(35)} | Main: ${t.mainGroup.padEnd(11)} | DB_Op: ${t.dbOpeningBalance.toString().padEnd(8)} | DB_Cl: ${t.dbClosingBalance.toString().padEnd(8)} | DB_Nat: ${t.nature.padEnd(6)} | Calc_Cl: ${calcCl.toFixed(2).padEnd(10)} | Mapped: ${mappedText}`);
  }
}

run().catch(console.error).finally(() => prisma.$disconnect());
